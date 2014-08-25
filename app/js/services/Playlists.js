songist.factory('Playlists', ['Db', function(Db) {
  return {
    getPlaylists: function() {
      var deferred = $.Deferred();
      var playlists = [];
      $.when(Db.dbPromise()).then(function(db) {
        db.transaction("playlists").objectStore("playlists")
            .index("ixPlaylist").openCursor().onsuccess = function(e) {
          var cursor = e.target.result;
          if (cursor) {
            if ($.inArray(cursor.value.playlist, playlists) == -1) {
              playlists.push(cursor.value.playlist);
            }
            cursor.continue();
          } else {
            deferred.resolve(playlists);
          }
        }
      });
      return deferred.promise();
    },

    getTracks: function(name, lower, upper) {
      var deferred = $.Deferred();
      var paths = [];
      var tracks= [];
      $.when(Db.dbPromise()).then(function(db) {
        var deferred2 = $.Deferred();
        var index = 0;
        db.transaction("playlists").objectStore("playlists")
            .index("ixPlaylist").openCursor(IDBKeyRange.only(name)).onsuccess = function(e) {
          var cursor = e.target.result;
          if (cursor) {
            var playlist = cursor.value;
            // !playlist.track is null when the playlist is empty
            if (playlist.track_path) {
              index++;
              if (index < lower) {
                cursor.continue();
              } else if (upper && index > upper) {
                deferred2.resolve(db);
              } else {
                paths.push(playlist.track_path);
                cursor.continue();
              }
            } else {
              cursor.continue();
            }
          } else {
            deferred2.resolve(db);
          }
        }
        return deferred2.promise();
      }).then(function(db) {
        var fetchTracks = function() {
          if (paths.length == 0) {
            deferred.resolve(tracks);
          } else {
            db.transaction("tracks").objectStore("tracks")
                .get(paths.shift()).onsuccess = function(e) {
              if (e.target.result) {
                tracks.push(e.target.result);
              }
              setTimeout(fetchTracks);
            };
          }
        };
        fetchTracks();
      });
      return deferred.promise();
    },

    add: function(name) {
      var deferred = $.Deferred();
      $.when(Db.dbPromise()).then(function(db) {
        db.transaction("playlists", "readwrite").objectStore("playlists").add({
          playlist: name
        }).onsuccess = function() {
          deferred.resolve();
        }
      });
      return deferred.promise();
    },

    addTrack: function(playlistName, trackPath) {
      var deferred = $.Deferred();
      $.when(Db.dbPromise()).then(function(db) {
        db.transaction('tracks').objectStore('tracks')
            .get(trackPath).onsuccess = function(e) {
          var track = e.target.result;
          if (!track) {
            deferred.resolve(null);
          } else {
            db.transaction('playlists', 'readwrite').objectStore('playlists')
                .add({
              playlist: playlistName,
              track_path: track.path
            }).onsuccess = function(e) {
              deferred.resolve(track);
            };
          }
        };
      });
      return deferred.promise();
    },

    rename: function(oldName, newName) {
      var deferred = $.Deferred();
      $.when(Db.dbPromise()).then(function(db) {
        var transaction = db.transaction("playlists", "readwrite")
        transaction.objectStore("playlists")
            .index("ixPlaylist")
            .openCursor(IDBKeyRange.only(oldName)).onsuccess = function(e) {
          var cursor = e.target.result;
          if (cursor) {
            var playlist = cursor.value;
            playlist.playlist = newName;
            cursor.update(playlist);
            cursor.continue();
          } else {
            transaction.oncomplete = function() {
              deferred.resolve();
            }
          }
        }
      });
      return deferred.promise();
    },

    /**
    * Here I'm trying a new approach with transaction.oncomplete
    */
    deleteTrack: function(playlistName, trackPath) {
      var deferred = $.Deferred();
      $.when(Db.dbPromise()).then(function(db) {
        var transaction = db.transaction('playlists', 'readwrite');
        transaction.objectStore('playlists')
            .index("ixPlaylist")
            .openCursor(IDBKeyRange.only(playlistName)).onsuccess = function(e) {
          var cursor = e.target.result;
          if (cursor) {
            var playlist = cursor.value;
            if (!trackPath || playlist.track_path == trackPath) {
              cursor.delete();
            } 
            cursor.continue();
          } else {
            transaction.oncomplete = function() {
              deferred.resolve();
            }
          }
        }
      });
      return deferred.promise();
    },

    process: function(file) {
      var deferred = $.Deferred();
      var db;
      var ext = file.name.substr(file.name.lastIndexOf(".") + 1);
      $.when(Db.dbPromise()).then(function(dbInstance) {
        db = dbInstance;
        if(file.name.substr(file.name.lastIndexOf(".") + 1) != 'm3u') {
          deferred.resolve({error: 'Only m3u playlists are supported'});
        } else {
          var trackReader = new FileReader();
          trackReader.onloadend = function(e) {
            var lines = e.target.result.replace(/(\r\n|\r|\n)/g, '\n');
            lines = lines.split("\n");
            var atLeastOneTrack = false;
            var name = file.name.substr(0, file.name.lastIndexOf(".m3u"));
            var processLine = function() {
              if (lines.length == 0) {
                if (atLeastOneTrack) {
                  deferred.resolve({name: name});
                } else {
                  deferred.resolve();
                }
              } else {
                var line = lines.shift().trim();
                if (line != '' && line.substr(0, 1) != '#') {
                  var lastIndex = line.lastIndexOf("/") + 1;
                  if (lastIndex == 0) {
                    lastIndex = line.lastIndexOf("\\") + 1;
                  }
                  var partialPath = line.substr(lastIndex);
                  $.when(function() {
                    var deferred2 = $.Deferred();
                    db.transaction('tracks').objectStore('tracks')
                        .openCursor().onsuccess = function(e) {
                      var cursor = e.target.result;
                      if (cursor) {
                        var track = cursor.value;
                        if (track.path.indexOf(partialPath) > -1) {
                          deferred2.resolve(track);
                        } else {
                          cursor.continue();
                        }
                      } else {
                        deferred2.resolve();
                      }
                    };
                    return deferred2.promise();
                  }()).then(function(track) {
                    if (track) {
                      db.transaction('playlists', 'readwrite').objectStore('playlists')
                          .add({
                        playlist: name,
                        track_path: track.path
                      }).onsuccess = function() {
                        atLeastOneTrack = true;
                        setTimeout(processLine);
                      };
                    } else {
                      setTimeout(processLine);
                    }
                  });
                } else {
                  setTimeout(processLine);
                }
              }
            };
            processLine();
          };
          trackReader.readAsText(file);
        }
      });
      return deferred.promise();
    }
  };
}]);
