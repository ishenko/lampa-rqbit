(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else factory(root).install();
}(typeof window !== 'undefined' ? window : this, function (root) {
    'use strict';
    var L = root.Lampa, API = 'http://192.168.1.1/cgi-bin/cudy-downloads';
    var DEVICE = '5c935c65-6057-4f38-9f73-0e836eadb521';
    var labels = { local: 'Скачать локально', usb: 'Скачать на флешку', library: 'Скачанное',
        unavailable: 'Cudy или флешка недоступны', empty: 'Пока нет скачанных видео' };
    function text(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
    function api(action, data, timeout) {
        data = data || {}; data.action = action;
        return new Promise(function (resolve, reject) {
            new L.Reguest().native(API, function (r) {
                try { if (typeof r === 'string') r = JSON.parse(r); if (r.error) throw Error(r.error); resolve(r); }
                catch (e) { reject(e); }
            }, function () { reject(Error(labels.unavailable)); }, JSON.stringify(data), {
                type: 'POST', dataType: 'json', timeout: timeout || 20000, headers: {'Content-Type':'application/json'}
            });
        });
    }
    function available(libraryMode) { return api('status',{},1800).then(function(s) { return s.server === 'cudy-downloads-v2' && s.device === DEVICE && (libraryMode && s.library_available !== undefined ? s.library_available : s.mounted && s.running); }).catch(function() { return false; }); }
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
            L.Loading.start(); return api('add_commit',{ticket:ticket,files:ids}).then(function(r) { ticket=null; L.Noty.show(r.phase==='moving'?'Подготовка раздачи к докачке':'Загрузка на флешку добавлена'); });
        }).catch(function(e) { if (ticket) api('add_cancel',{ticket:ticket}).catch(function(){}); notify(e); }).then(function() { L.Loading.stop(); });
    }
    function watched(hash,id) { return !!L.Storage.get('cudy_downloads_seen',{})[hash+':'+id]; }
    function drawEye(item,data) {
        if(data.eye) item.find('.selectbox-item__title').append(L.Template.get('icon_viewed',{},true).replace('<svg','<svg style="width:1em;height:1em;vertical-align:middle;margin-left:0.5em"'));
    }
    function play(album,file) {
        try {
            L.Android.openPlayer(file.url,{title:file.name,position:-1});
            var seen=L.Storage.get('cudy_downloads_seen',{}); seen[album.hash+':'+file.index]=true;
            L.Storage.set('cudy_downloads_seen',seen);
        } catch(e) { notify(e); }
    }
    function folder(album,prefix,back) {
        var dirs={}, rows=[];
        sorted(album.files).forEach(function(f) {
            if (f.name.indexOf(prefix)!==0) return;
            var tail=f.name.slice(prefix.length), slash=tail.indexOf('/');
            if (slash>=0) dirs[tail.slice(0,slash)]=true;
            else rows.push({title:text(tail),file:f,eye:watched(album.hash,f.index)});
        });
        var items=Object.keys(dirs).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true});}).map(function(d){return {title:text(d),subtitle:'Папка',dir:prefix+d+'/'};}).concat(rows);
        L.Select.show({title:prefix ? prefix.replace(/\/$/,'') : text(album.name),items:items,
            onDraw:drawEye,
            onBack:back,onSelect:function(row) {
                if (row.dir) folder(album,row.dir,function(){folder(album,prefix,back);});
                else { play(album,row.file); folder(album,prefix,back); }
            }});
    }
    function library() {
        var parent=previous(); L.Loading.start();
        return available(true).then(function(ok){if(!ok) throw Error(labels.unavailable);return api('library');}).then(function(r) {
            L.Loading.stop();
            if (!r.albums.length) { var moving=(r.transfers||[])[0]; L.Noty.show(moving ? (moving.error || 'Файлы переносятся между разделами') : labels.empty); return; }
            function show() {
                L.Select.show({title:labels.library,items:sorted(r.albums).map(function(a) {
                    return {title:text(a.name),subtitle:a.folder?a.files.length+' файлов':'Видео',album:a,eye:!a.folder && a.files.length===1 && watched(a.hash,a.files[0].index)};
                }),onDraw:drawEye,
                onBack:function(){L.Controller.toggle(parent);},onSelect:function(row) {
                    if(row.album.files.length===1 && !row.album.folder) {play(row.album,row.album.files[0]);show();}
                    else folder(row.album,'',show);
                }});
            }
            show();
        }).catch(notify).then(function(){L.Loading.stop();});
    }
    function install() {
        if (!L || root.cudy_downloads_installed || !L.Android || !L.Reguest) return;
        root.cudy_downloads_installed=true;
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
    return {install:install,available:available,choose:choose,download:download,library:library,play:play,labels:labels};
}));
