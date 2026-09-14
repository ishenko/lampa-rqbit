(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else factory(root).install();
}(typeof window !== 'undefined' ? window : this, function (root) {
    'use strict';
    var L = root.Lampa, API = 'http://192.168.1.1/cgi-bin/cudy-downloads';
    var DEVICE = '5c935c65-6057-4f38-9f73-0e836eadb521';
    var labels = { local: 'Скачать локально', usb: 'Скачать на флешку', library: 'Скачанное',
        unavailable: 'Cudy или флешка недоступны', empty: 'Пока нет загрузок' };
    var refreshTimer, refreshVersion=0;
    function stopRefresh() { refreshVersion++; if(refreshTimer) root.clearTimeout(refreshTimer); refreshTimer=null; }
    function text(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
    function api(action, data, timeout) {
        data = data || {}; data.action = action;
        return new Promise(function (resolve, reject) {
            // Use an explicit browser request; Lampa's native wrapper differs between builds.
            if (root.XMLHttpRequest) {
                var xhr = new root.XMLHttpRequest(), settled = false;
                function fail(e) { if (!settled) { settled = true; reject(e instanceof Error ? e : Error(labels.unavailable)); } }
                xhr.open('POST', API, true);
                xhr.timeout = timeout || 20000;
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.onreadystatechange = function () {
                    if (xhr.readyState !== 4 || settled) return;
                    if (xhr.status < 200 || xhr.status >= 300) return fail(Error(labels.unavailable));
                    try { var r = JSON.parse(xhr.responseText || '{}'); if (r.error) throw Error(r.error); settled = true; resolve(r); }
                    catch (e) { fail(e); }
                };
                xhr.onerror = function () { fail(Error(labels.unavailable)); };
                xhr.ontimeout = function () { fail(Error(labels.unavailable)); };
                try { xhr.send(JSON.stringify(data)); } catch (e) { fail(e); }
                return;
            }
            new L.Reguest().native(API, function (r) {
                try { if (typeof r === 'string') r = JSON.parse(r); if (r.error) throw Error(r.error); resolve(r); }
                catch (e) { reject(e); }
            }, function () { reject(Error(labels.unavailable)); }, JSON.stringify(data), {
                type: 'POST', dataType: 'json', timeout: timeout || 20000, headers: {'Content-Type':'application/json'}
            });
        });
    }
    function available() { return api('status',{},1800).then(function(s) { return s.server === 'cudy-downloads-v2' && s.device === DEVICE && s.mounted && s.running; }).catch(function() { return false; }); }
    function previous() { return L.Controller.enabled().name; }
    function notify(e) { L.Noty.show(e.message || String(e)); }
    function source(e) { var s=e.MagnetUri || e.Link; if (typeof s!=='string' || !/^(magnet:\?|https?:\/\/)/i.test(s)) throw Error('Нет magnet или ссылки на torrent'); return s; }
    function sorted(files) { return files.slice().sort(function(a,b) { return a.name.localeCompare(b.name,undefined,{numeric:true}); }); }
    function choose(files) {
        return new Promise(function(resolve) {
            var parent=previous(), selection={};
            files.forEach(function(f) { if (f.wanted) selection[f.index]=true; });
            if (files.length === 1) selection[files[0].index]=true;
            function show() {
                var folder='', items=[{title:'Выбрать всё',all:true},{title:'Снять выделение',none:true},{title:'Скачать выбранное',done:true}];
                sorted(files).forEach(function(f) {
                    var parts=f.name.split('/'), dir=parts.slice(0,-1).join('/');
                    if (dir!==folder) { if (dir) items.push({title:text(dir),separator:true}); folder=dir; }
                    items.push({title:text(parts[parts.length-1]),subtitle:L.Utils ? L.Utils.bytesToSize(f.size) : '',checkbox:true,checked:!!selection[f.index],file:f.index});
                });
                L.Select.show({title:labels.usb,items:items,
                    onCheck:function(item) { if (item.checked) selection[item.file]=true; else delete selection[item.file]; },
                    onBack:function() { L.Controller.toggle(parent); resolve(null); },
                    onSelect:function(item) {
                        if (item.done) {
                            var ids=Object.keys(selection).map(Number);
                            if (!ids.length) { L.Noty.show('Выберите файлы'); show(); return; }
                            L.Controller.toggle(parent); resolve(ids);
                        } else { selection={}; if (item.all) files.forEach(function(f) {selection[f.index]=true;}); show(); }
                    }
                });
            }
            show();
        });
    }
    function ready(ticket,deadline) {
        return api('add_status',{ticket:ticket}).then(function(s) {
            if (s.phase==='ready') return s;
            if (Date.now()>deadline) throw Error('Не удалось получить список файлов');
            return new Promise(function(resolve) { root.setTimeout(resolve,1000); }).then(function() { return ready(ticket,deadline); });
        });
    }
    function download(element) {
        var ticket;
        L.Loading.start();
        return Promise.resolve().then(function() { return api('add_inspect',{source:source(element)}); }).then(function(r) {
            ticket=r.ticket; return ready(ticket,Date.now()+180000);
        }).then(function(s) { L.Loading.stop(); return choose(s.files); }).then(function(ids) {
            if (ids===null) return api('add_cancel',{ticket:ticket});
            L.Loading.start(); return api('add_commit',{ticket:ticket,files:ids}).then(function() { ticket=null; L.Noty.show('Загрузка на флешку добавлена'); });
        }).catch(function(e) { if (ticket) api('add_cancel',{ticket:ticket}).catch(function(){}); notify(e); }).then(function() { L.Loading.stop(); });
    }
    function watched(hash,id) { return !!L.Storage.get('cudy_downloads_seen',{})[hash+':'+id]; }
    function drawEye(item,data) {
        if(data.eye) item.find('.selectbox-item__title').append(L.Template.get('icon_viewed',{},true).replace('<svg','<svg style="width:1em;height:1em;vertical-align:middle;margin-left:0.5em"'));
    }
    function play(album,file,back) {
        try {
            if (!file.url || file.ready===false) throw Error('Файл ещё не скачан');
            var playlist=sorted(album.files || [file]).filter(function(f){return f.url && f.ready!==false;}).map(function(f){return {url:f.url,title:f.name.split('/').pop()};});
            var data={url:file.url,title:file.name.split('/').pop(),playlist:playlist};
            if(L.Platform && L.Platform.is('android')) data.launch_player='android';
            // Android uses the native external-player chooser; browsers retain their player settings.
            if(L.Player.runas) L.Player.runas(false);
            L.Player.play(data);
            if(L.Player.runas) L.Player.runas(false);
            if (L.Player.playlist) L.Player.playlist(playlist);
            if (L.Player.callback) L.Player.callback(back || library);
            var seen=L.Storage.get('cudy_downloads_seen',{}); seen[album.hash+':'+file.index]=true;
            L.Storage.set('cudy_downloads_seen',seen);
            return true;
        } catch(e) { notify(e); }
        return false;
    }
    function bytes(n) {
        if(L.Utils && L.Utils.bytesToSize) return L.Utils.bytesToSize(n || 0);
        var units=['B','KiB','MiB','GiB','TiB'], i=0; n=n || 0;
        while(n>=1024 && i<units.length-1) {n/=1024;i++;}
        return n.toFixed(i?1:0)+' '+units[i];
    }
    function percent(done,total) { return total ? Math.min(100,100*done/total).toFixed(1)+'%' : '0%'; }
    function downloadText(album) {
        var d=album.download;
        if(!d) return album.files.length+' файлов';
        var states={finished:'Скачано',paused:'Пауза',queued:'В очереди',checking:'Проверка',metadata:'Получение списка файлов',error:'Ошибка',live:'Скачивается'};
        return (states[d.state] || d.state)+' · '+percent(d.progress,d.total)+' · '+bytes(d.progress)+' / '+bytes(d.total)+' · '+bytes((d.down || 0)*1048576)+'/с'+(d.error?' · '+d.error:'');
    }
    function manage(album,back) {
        stopRefresh();
        var d=album.download || {}, ready=album.files.filter(function(f){return f.url && f.ready!==false;}), items=[];
        if(ready.length) items.push({title:album.folder?'Открыть файлы':'Смотреть',watch:true});
        else if(album.files.length) items.push({title:'Файлы',watch:true});
        if(!d.finished) items.push({title:d.paused?'Продолжить':'Пауза',action:d.paused?'resume':'pause'});
        items.push({title:'Удалить торрент и файлы',action:'delete'});
        function perform(action) {
            L.Loading.start();
            return api(action,{hash:album.hash,confirm:action==='delete'}).then(function(){L.Loading.stop();back();},function(e){L.Loading.stop();notify(e);back();});
        }
        L.Select.show({title:album.name,items:items.map(function(item){item.subtitle=text(downloadText(album));return item;}),onBack:back,onSelect:function(row){
            if(row.watch) {
                if(!album.folder && ready.length===1) {
                    L.Controller.toggle('content');
                    if(!play(album,ready[0],function(){manage(album,back);})) manage(album,back);
                } else folder(album,'',function(){manage(album,back);});
            } else if(row.action==='delete') {
                L.Select.show({title:'Удалить '+album.name+'?',items:[{title:'Отмена'},{title:'Удалить торрент и его файлы с флешки',remove:true}],onBack:function(){manage(album,back);},onSelect:function(choice){
                    if(choice.remove) perform('delete'); else manage(album,back);
                }});
            } else perform(row.action);
        }});
    }
    function folder(album,prefix,back) {
        stopRefresh();
        var dirs={}, rows=[];
        sorted(album.files).forEach(function(f) {
            if (f.name.indexOf(prefix)!==0) return;
            var tail=f.name.slice(prefix.length), slash=tail.indexOf('/');
            if (slash>=0) dirs[tail.slice(0,slash)]=true;
            else rows.push({title:text(tail),subtitle:bytes(f.size)+(f.url?'':' · '+percent(f.completed || 0,f.size)),file:f,eye:watched(album.hash,f.index),ghost:!f.url});
        });
        var items=Object.keys(dirs).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true});}).map(function(d){return {title:text(d),subtitle:'Папка',dir:prefix+d+'/'};}).concat(rows);
        L.Select.show({title:prefix ? prefix.replace(/\/$/,'').split('/').pop() : album.name,items:items,
            onDraw:drawEye,
            onBack:back,onSelect:function(row) {
                if (row.dir) folder(album,row.dir,function(){folder(album,prefix,back);});
                else {
                    L.Controller.toggle('content');
                    if(!play(album,row.file,function(){folder(album,prefix,back);})) folder(album,prefix,back);
                }
            }});
    }
    function library() {
        stopRefresh();
        var parent=previous()==='select'?'content':previous(), loadVersion=refreshVersion;
        L.Loading.start();
        return available().then(function(ok){if(!ok) throw Error(labels.unavailable);return api('library');}).then(function(r) {
            L.Loading.stop();
            if(loadVersion!==refreshVersion) return;
            if (!r.albums.length) { L.Noty.show(labels.empty); return; }
            function show() {
                stopRefresh();
                var rows={}, items=sorted(r.albums).map(function(a) {
                    return {title:text(a.name),subtitle:text(downloadText(a)),album:a,eye:!a.folder && a.files.length===1 && watched(a.hash,a.files[0].index)};
                });
                L.Select.show({title:labels.library,items:items,
                    onDraw:function(item,data){drawEye(item,data);rows[data.album.hash]={node:item,data:data};},
                    onBack:function(){stopRefresh();L.Controller.toggle(parent);},
                    onSelect:function(row){stopRefresh();manage(row.album,library);}
                });
                var version=refreshVersion;
                function tick() {
                    refreshTimer=root.setTimeout(function(){
                        if(version!==refreshVersion) return;
                        api('library').then(function(next){
                            if(version!==refreshVersion) return;
                            r=next;
                            if(next.albums.length!==items.length || next.albums.some(function(a){return !rows[a.hash];})) {show();return;}
                            next.albums.forEach(function(a){var row=rows[a.hash];row.data.album=a;row.node.find('.selectbox-item__subtitle').text(downloadText(a));});
                            tick();
                        }).catch(function(e){if(version===refreshVersion) {stopRefresh();notify(e);}});
                    },5000);
                }
                tick();
            }
            show();
        }).catch(notify).then(function(){L.Loading.stop();});
    }
    function install() {
        if (!L || root.cudy_downloads_installed || !L.Reguest) return;
        root.cudy_downloads_installed=true;
        if(L.Select.listener) {
            L.Select.listener.follow('hide',stopRefresh);
            L.Select.listener.follow('preshow',stopRefresh);
        }
        if(root.addEventListener) root.addEventListener('pagehide',stopRefresh);
        ['cudy_rqbit_user','cudy_rqbit_password','cudy_rqbit_client','cudy_rqbit_playback'].forEach(function(k){if(L.Storage.remove)L.Storage.remove(k);});
        L.Listener.follow('torrent',function(e) {
            if(e.type!=='render' || !e.item || e.item.data('cudy_downloads')) return;
            e.item.data('cudy_downloads',true);
            e.item.off('hover:long');
            var busy=false;
            e.item.on('hover:long',function(){
                if(busy)return; var parent=previous(), open=true;
                function show(usb) {
                    var items=[{title:labels.local,local:true}]; if(usb)items.push({title:labels.usb});
                    L.Select.show({title:'Скачать торрент',items:items,onBack:function(){open=false;L.Controller.toggle(parent);},onSelect:function(a){
                        open=false;
                        L.Controller.toggle(parent);
                        if(a.local) { try { L.Android.openTorrent({object:e.element,movie:(L.Activity.active()||{}).movie||{}}); } catch(err){notify(err);} }
                        else {busy=true; download(e.element).then(function(){busy=false;});}
                    }});
                }
                show(false);
                available().then(function(ok){if(open && ok)show(true);});
            });
        });
        function menu() { L.Menu.addButton(L.Template.get('icon_collection',{},true),labels.library,library); }
        if(root.appready)menu(); else L.Listener.follow('app',function(e){if(e.type==='ready')menu();});
    }
    return {install:install,available:available,choose:choose,download:download,library:library,play:play,manage:manage,stopRefresh:stopRefresh,downloadText:downloadText,labels:labels};
}));
