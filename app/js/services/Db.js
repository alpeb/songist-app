songist.factory('Db', function() {
  var db;
  var scope;

  return {
    setScope: function(theScope) {
      scope = theScope;
    },

    dbPromise: function() {
      var deferredDb = $.Deferred();
      if (!db) {
        var dbReq = window.indexedDB.open('songistDb', 1);
        dbReq.onerror = function(e) {
          console.log("ERROR OPENING SONGIST DB");
        }
        dbReq.onsuccess = function(e) {
          console.log("OPENED SONGIST DB");
          db = dbReq.result;
          db.onerror = function(e) {
            console.log("DB ERROR: ", e);
            scope.$broadcast('dbError', {
              name: e.srcElement && e.srcElement.error && e.srcElement.error.name,
              message: e.srcElement && e.srcElement.error && e.srcElement.error.message,
              store: e.srcElement && e.srcElement.source && e.srcElement.source.name,
              keyPath: e.srcElement && e.srcElement.source && e.srcElement.source.keyPath
            });
          }
          deferredDb.resolve(db);
        }
        dbReq.onupgradeneeded = function(e) {
          console.log("CREATING DB");
          var db = e.target.result;
          db.createObjectStore("genres", {keyPath: "name"});

          var artistsObjectStore = db.createObjectStore("artists", {keyPath: "name"});
          artistsObjectStore.createIndex("ixGenre", "genre", {unique: false});

          var albumsObjectStore = db.createObjectStore("albums", {keyPath: "name"});
          albumsObjectStore.createIndex("ixGenre", "genre", {unique: false});
          albumsObjectStore.createIndex("ixArtist", "artist", {unique: false});

          var tracksObjectStore = db.createObjectStore("tracks", {keyPath: "path"});
          tracksObjectStore.createIndex("ixGenre", "genre", {unique: false});
          tracksObjectStore.createIndex("ixArtist", "artist", {unique: false});
          tracksObjectStore.createIndex("ixAlbum", "album", {unique: false});

          var queueObjectStore = db.createObjectStore("queue", {autoIncrement: true});
          queueObjectStore.createIndex("ixIndex", "index", {unique: false});
          queueObjectStore.createIndex("ixPath", "path", {unique: false});

          var playlistsObjectStore = db.createObjectStore("playlists", {keyPath: "id", autoIncrement: true});
          playlistsObjectStore.createIndex("ixPlaylist", "playlist", {unique: false});
          playlistsObjectStore.createIndex("ixPath", "track_path", {unique: false});
        }
      } else {
        deferredDb.resolve(db);
      }

      return deferredDb.promise();
    },

    isNewDb: function() {
      var deferred = $.Deferred();
      $.when(this.dbPromise()).then(function(db) {
        db.transaction("tracks")
            .objectStore("tracks")
            .openCursor().onsuccess = function(e) {
          deferred.resolve(e.target.result? false: true);
        };
      });
      return deferred.promise();
    }
  };
});
