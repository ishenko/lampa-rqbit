(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else factory(root).install();
}(typeof window !== 'undefined' ? window : this, function (root) {
    'use strict';
    var L = root.Lampa;
    var API = 'http://192.168.1.1:3030';
    var POLICY = 'http://192.168.1.1/cgi-bin/cudy-rqbit';
    var playback = false, departed = false, ending = false, launched = 0;
    var labels = {
        local: '\u0421\u043a\u0430\u0447\u0430\u0442\u044c \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e',
        keep: '\u0421\u043a\u0430\u0447\u0430\u0442\u044c \u043d\u0430 \u0444\u043b\u0435\u0448\u043a\u0443',
        files: '\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u0432\u0438\u0434\u0435\u043e',
        added: '\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u043d\u0430 \u0444\u043b\u0435\u0448\u043a\u0443 \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u0430',
        nofiles: '\u0412 \u0440\u0430\u0437\u0434\u0430\u0447\u0435 \u043d\u0435\u0442 \u0432\u0438\u0434\u0435\u043e',
        credentials: '\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u043b\u043e\u0433\u0438\u043d \u0438 \u043f\u0430\u0440\u043e\u043b\u044c \u0432 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430\u0445 rqbit',
        password: '\u041f\u0430\u0440\u043e\u043b\u044c',
        username: '\u041b\u043e\u0433\u0438\u043d'
    };
    function credential() {
        var user = L.Storage.get('cudy_rqbit_user', 'lampa');
        var password = L.Storage.get('cudy_rqbit_password', '');
        if (!user || !password) throw new Error(labels.credentials);
        return { user: user, password: password };
    }
    function request(url, body, jsonBody) {
        return new Promise(function (resolve, reject) {
            var auth;
            try { auth = credential(); } catch (e) { reject(e); return; }
            var net = new L.Reguest();
            net.native(url, function (data) {
                try { resolve(typeof data === 'string' ? JSON.parse(data) : data); }
                catch (e) { reject(new Error('rqbit: invalid API response')); }
            }, function () { reject(new Error('rqbit: connection or authentication failed')); }, body === undefined ? false : body, {
                type: body === undefined ? 'GET' : 'POST',
                dataType: 'json', timeout: url.indexOf('list_only=true') >= 0 ? 180000 : 30000,
                headers: {
                    Authorization: 'Basic ' + root.btoa(auth.user + ':' + auth.password),
                    'Content-Type': jsonBody ? 'application/json' : 'text/plain'
                }
            });
        });
    }
    function policy(data) { return request(POLICY, JSON.stringify(data), true); }
    function client() {
        var id = L.Storage.get('cudy_rqbit_client', '');
        if (!/^[a-zA-Z0-9-]{8,80}$/.test(id)) {
            id = 'lampa-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
            L.Storage.set('cudy_rqbit_client', id);
        }
        return id;
    }
    function endPlayback(force) {
        if ((!playback && !force) || ending) return Promise.resolve();
        ending = true;
        return policy({ action: 'watch_end', client: client() }).then(function (result) {
            if (result.error) throw new Error(result.error);
            playback = false; departed = false;
            L.Storage.set('cudy_rqbit_playback', false);
        }).catch(function (error) { L.Noty.show(error.message || 'rqbit priority error'); }).then(function () { ending = false; });
    }
    function playbackEvents() {
        // Android can omit visibility events. The first input back in Lampa also ends this session.
        root.document.addEventListener('visibilitychange', function () {
            if (root.document.hidden) departed = true;
            else if (departed) endPlayback(false);
        });
        root.addEventListener('blur', function () { if (playback) departed = true; });
        root.addEventListener('focus', function () { if (departed) endPlayback(false); });
        ['keydown', 'pointerdown', 'touchstart'].forEach(function (event) {
            root.document.addEventListener(event, function () {
                if (playback && Date.now() - launched > 1500) endPlayback(false);
            }, true);
        });
        if (L.Storage.get('cudy_rqbit_playback', false)) {
            playback = true;
            endPlayback(true);
        }
    }
    function source(element) {
        var uri = element.MagnetUri || element.Link;
        if (typeof uri !== 'string' || !/^(magnet:\?|https?:\/\/)/i.test(uri)) throw new Error('rqbit: no magnet or torrent URL');
        return uri;
    }
    function titleText(value) {
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function videos(files) {
        return files.map(function (f, i) { return { file: f, id: i }; }).filter(function (item) {
            var name = item.file.name || '';
            return /\.(mkv|mp4|m4v|avi|webm|mov|ts|m2ts|mpg|mpeg|wmv|vob)$/i.test(name) &&
                !/(^|[\/\\._\s\-\[\(])(sample|samples|trailer|trailers|extras|extra|featurette|featurettes|bonus)(?=$|[\/\\._\s\-\]\)])/i.test(name);
        }).sort(function (a, b) {
            return a.file.name.localeCompare(b.file.name, undefined, { numeric: true });
        });
    }
    function choose(files) {
        var list = videos(files);
        if (!list.length) return Promise.reject(new Error(labels.nofiles));
        if (list.length === 1) return Promise.resolve(list[0].id);
        L.Loading.stop();
        return new Promise(function (resolve) {
            var previous = L.Controller.enabled().name;
            L.Select.show({
                title: labels.files,
                items: list.map(function (v) { return { title: titleText(v.file.name), file_id: v.id }; }),
                onSelect: function (item) { L.Controller.toggle(previous); L.Loading.start(); resolve(item.file_id); },
                onBack: function () { L.Controller.toggle(previous); resolve(null); }
            });
        });
    }
    function chooseDownload(files) {
        if (files.length === 1) return Promise.resolve([0]);
        L.Loading.stop();
        return new Promise(function (resolve) {
            var previous = L.Controller.enabled().name;
            var all = files.map(function (_, i) { return i; });
            L.Select.show({ title: labels.keep,
                items: [{ title: '\u0412\u0441\u0435 \u0444\u0430\u0439\u043b\u044b', ids: all }].concat(files.map(function (file, id) {
                    return { title: titleText(file.name), ids: [id] };
                })),
                onSelect: function (item) { L.Controller.toggle(previous); L.Loading.start(); resolve(item.ids); },
                onBack: function () { L.Controller.toggle(previous); resolve(null); }
            });
        });
    }
    function prepare(data, attempts) {
        return policy(data).then(function (result) {
            if (result.error) throw new Error(result.error);
            if (!result.busy) return result;
            if (!attempts) throw new Error('rqbit: torrent is busy, try again');
            return new Promise(function (resolve) { root.setTimeout(resolve, 1000); }).then(function () {
                return prepare(data, attempts - 1);
            });
        });
    }
    function waitReady(hash, deadline) {
        return request(API + '/torrents/' + hash + '/stats/v1').then(function (stats) {
            if (stats.state === 'error') throw new Error('rqbit: torrent initialization failed');
            if (stats.state !== 'initializing') return;
            if (Date.now() >= deadline) throw new Error('rqbit: initialization is still running; try again shortly');
            return new Promise(function (resolve) { root.setTimeout(resolve, 1000); }).then(function () {
                return waitReady(hash, deadline);
            });
        });
    }
    function apply(uri, details, ids, permanent) {
        var hash = details.info_hash;
        if (!/^[a-f0-9]{40}$/.test(hash) || !details.files) return Promise.reject(new Error('rqbit: invalid metadata'));
        return prepare({ action: 'prepare', hash: hash, files: ids, file_count: details.files.length,
            retention: permanent ? 'permanent' : 'temp' }, 30).then(function (transaction) {
            var added = transaction.existing ? Promise.resolve() : request(API + '/torrents?is_url=true&overwrite=true&output_folder=' +
                encodeURIComponent(transaction.output_folder) + '&only_files=' + transaction.files.join(','), uri);
            return added.then(function () {
                return waitReady(hash, Date.now() + 90000);
            }).then(function () {
                return request(API + '/torrents/' + hash + '/update_only_files', JSON.stringify({ only_files: transaction.files }), true);
            }).then(function () {
                return request(API + '/torrents/' + hash + '/stats/v1').then(function (stats) {
                    if (stats.state === 'paused' || stats.initializing_paused) return request(API + '/torrents/' + hash + '/start', '{}', true);
                });
            }).then(function () {
                return policy({ action: 'commit', hash: hash, lease: transaction.lease });
            }).then(function (result) {
                if (result.error) throw new Error(result.error);
                return hash;
            });
        });
    }
    function play(hash, id, title, movie) {
        var auth = credential();
        var url = API.replace('://', '://' + encodeURIComponent(auth.user) + ':' + encodeURIComponent(auth.password) + '@') +
            '/torrents/' + hash + '/stream/' + id;
        return policy({ action: 'watch_begin', client: client(), hash: hash }).then(function (result) {
            if (result.error) throw new Error(result.error);
            if (result.errors && result.errors.length) L.Noty.show('rqbit: some background downloads could not be paused');
            playback = true; departed = false; launched = Date.now();
            L.Storage.set('cudy_rqbit_playback', true);
            // Android's existing external-player preference selects VLC; no video proxy.
            try { L.Android.openPlayer(url, { title: title, card: movie, position: -1 }); }
            catch (error) { return endPlayback(true).then(function () { throw error; }); }
        });
    }
    function run(element, permanent, movie) {
        var uri;
        try { uri = source(element); credential(); } catch (e) { return Promise.reject(e); }
        return request(API + '/torrents?list_only=true&is_url=true', uri).then(function (result) {
            var details = result.details;
            if (!details || !Array.isArray(details.files)) throw new Error('rqbit: metadata unavailable');
            if (permanent) {
                return chooseDownload(details.files).then(function (ids) {
                    if (ids === null) return;
                    return apply(uri, details, ids, true).then(function () { L.Noty.show(labels.added); });
                });
            }
            return choose(details.files).then(function (id) {
                if (id === null) return;
                return apply(uri, details, [id], false).then(function (hash) {
                    return play(hash, id, details.files[id].name, movie);
                });
            });
        });
    }
    function settings() {
        L.SettingsApi.addComponent({ component: 'cudy_rqbit', name: 'rqbit' });
        [ ['user', labels.username, 'lampa'], ['password', labels.password, ''] ].forEach(function (field) {
            L.SettingsApi.addParam({ component: 'cudy_rqbit',
                param: { name: 'cudy_rqbit_' + field[0], type: 'input', values: '', default: field[2] },
                field: { name: field[1] },
                onRender: function (item) {
                    if (field[0] === 'password') item.find('.settings-param__value').text('********');
                }
            });
        });
        L.SettingsApi.addParam({ component: 'cudy_rqbit',
            param: { name: 'cudy_rqbit_resume', type: 'button' },
            field: { name: '\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c \u043f\u0440\u0438\u043e\u0440\u0438\u0442\u0435\u0442 \u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440\u0430' },
            onRender: function (item) { item.on('hover:enter', function () { endPlayback(true); }); }
        });
    }
    function install() {
        if (!L || root.cudy_rqbit_installed) return;
        if (!L.Platform.is('android') || !L.Android || !L.Reguest || !L.SettingsApi) {
            if (L.Noty) L.Noty.show('rqbit: Android Lampa required');
            return;
        }
        root.cudy_rqbit_installed = true;
        settings();
        playbackEvents();
        L.Listener.follow('torrent', function (event) {
            if (event.type !== 'render' || !event.item || event.item.data('cudy_rqbit')) return;
            var item = event.item, element = event.element;
            item.data('cudy_rqbit', true);
            var busy = false;
            function movie() { return (L.Activity.active() || {}).movie || {}; }
            function start(permanent) {
                if (busy) return;
                busy = true;
                L.Loading.start();
                run(element, permanent, movie()).catch(function (error) { L.Noty.show(error.message || 'rqbit error'); }).then(function () {
                    busy = false; L.Loading.stop();
                });
            }
            item.off('hover:enter hover:long');
            item.on('hover:enter', function () { start(false); });
            item.on('hover:long', function () {
                var previous = L.Controller.enabled().name;
                L.Select.show({ title: 'rqbit', items: [ { title: labels.local, action: 'local' }, { title: labels.keep, action: 'keep' } ],
                    onBack: function () { L.Controller.toggle(previous); },
                    onSelect: function (action) {
                        L.Controller.toggle(previous);
                        if (action.action === 'local') {
                            try { source(element); L.Android.openTorrent({ object: element, movie: movie() }); }
                            catch (error) { L.Noty.show(error.message); }
                        } else if (action.action === 'keep') start(true);
                    }
                });
            });
        });
    }
    return { install: install, videos: videos, run: run, labels: labels };
}));
