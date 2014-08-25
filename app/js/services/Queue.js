songist.factory('Queue', ['Db', function(Db) {
  var shuffleArray = function(arr) {
    arr = arr.slice(0);
    for(var j, x, i = arr.length; i; j = Math.floor(Math.random() * i), x = arr[--i], arr[i] = arr[j], arr[j] = x) {}
    return arr;
  };

  var getIndex = function() {
    var deferred = $.Deferred();
    $.when(Db.dbPromise()).then(function(db) {
      var index = 0;
      db.transaction("queue").objectStore("queue").index('ixIndex')
          .openCursor().onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
          index = cursor.value.index;
          cursor.continue();
        } else {
          deferred.resolve(index);
        }
      }
    });

    return deferred.promise();
  };

  return {
    getQueue: function(lower, upper) {
      var deferred = $.Deferred();
      var tracks = [];
      $.when(Db.dbPromise()).then(function(db) {
        var index = 0;
        var transaction = db.transaction(['queue', 'tracks']);
        var tracksObjectStore = transaction.objectStore('tracks');
        transaction.objectStore("queue").index("ixIndex")
            .openCursor().onsuccess = function(e) {
          var cursor = e.target.result;
          if (cursor) {
            index++;
            var queueItem = cursor.value;
            if (index < lower) {
              cursor.continue();
            } else if (index > upper) {
              deferred.resolve(tracks);
            } else {
              tracksObjectStore.get(queueItem.path).onsuccess = function(e) {
                var track = e.target.result;
                if (track) {
                  // needed for remove() and eventual resort
                  track.index = queueItem.index;

                  tracks.push(track);
                }
                cursor.continue();
              };
            }
          } else {
            deferred.resolve(tracks);
          }
        };
      });

      return deferred.promise();
    },

    getFirst: function() {
      return this.getNext();
    },

    getNext: function(currentTrack) {
      var deferred = $.Deferred();
      $.when(Db.dbPromise()).then(function(db) {
        var next = false;
        var transaction = db.transaction(['queue', 'tracks']);
        var tracksObjectStore = transaction.objectStore("tracks");
        transaction.objectStore("queue").index('ixIndex')
            .openCursor().onsuccess = function(e) {
          var cursor = e.target.result;
          if (cursor) {
            var queueItem = cursor.value;
            if (!currentTrack) {
              tracksObjectStore.get(queueItem.path).onsuccess = function(e) {
                var track = e.target.result;
                if (track) {
                  deferred.resolve(track);
                }
              };
            } else if (queueItem.path == currentTrack.path) {
              next = true;
              cursor.continue();
            } else if (next) {
              tracksObjectStore.get(queueItem.path).onsuccess = function(e) {
                var track = e.target.result;
                if (track) {
                  deferred.resolve(track);
                }
              };
            } else {
              cursor.continue();
            }
          } else {
            deferred.resolve(null);
          }
        }
      });
      return deferred.promise();
    },

    push: function(track) {
      var deferred = $.Deferred();
      $.when(Db.dbPromise()).then(function(db) {
        $.when(getIndex()).then(function(queueIndex) {
          db.transaction("queue", "readwrite").objectStore("queue")
              .put({index: queueIndex + 1, path: track.path}).onsuccess = function(e) {
            deferred.resolve();
          }
        });
      });

      return deferred.promise();
    },

    /**
    * This is an example where concurrent read-write did work...
    */
    pushAll: function(genre, artist, album, query) {
      if (query) {
        query = query.toLowerCase();
      }
      var deferred = $.Deferred();
      $.when(Db.dbPromise()).then(function(db) {
        $.when(getIndex()).then(function(queueIndex) {
          var transaction = db.transaction(['tracks', 'queue'], 'readwrite')
          var queueObjectStore = transaction.objectStore('queue');
          transaction.objectStore('tracks').openCursor().onsuccess = function(e) {
            var cursor = e.target.result;
            if (cursor) {
              var track = cursor.value;
              if ((!genre || genre == track.genre)
                  && (!artist || artist == track.artist)
                  && (!album || album == track.album)
                  && (!query
                    || track.genre.indexOf(query) > -1
                    || track.artist.indexOf(query) > -1
                    || track.album.indexOf(query) > -1
                    || track.title.toLowerCase().indexOf(query) > -1)) {
                queueObjectStore.put({index: ++queueIndex, path: track.path}).onsuccess = function() {
                  cursor.continue();
                };
              } else {
                cursor.continue();
              }
            } else {
              deferred.resolve();
            }
          };
        });
      });

      return deferred.promise();
    },

    pushPlaylist: function(playlistName) {
      var deferred = $.Deferred();
      $.when(Db.dbPromise()).then(function(db) {
        $.when(getIndex()).then(function(queueIndex) {
          var transaction = db.transaction(['playlists', 'queue'], 'readwrite');
          var queueObjectStore = transaction.objectStore("queue");
          transaction.objectStore("playlists").index("ixPlaylist")
              .openCursor(IDBKeyRange.only(playlistName)).onsuccess = function(e) {
            var cursor = e.target.result;
            if (cursor) {
              var playlist = cursor.value;
              if (playlist.track_path) {
                queueObjectStore.put({index: ++queueIndex, path: playlist.track_path});
              }
              cursor.continue();
            } else {
              transaction.oncomplete = function() {
                deferred.resolve();
              };
            }
          }
        });
      });
      return deferred.promise();
    },

    shuffle: function() {
      var deferred = $.Deferred();
      $.when(Db.dbPromise()).then(function(db) {
        var transaction = db.transaction('queue', 'readwrite');
        transaction.objectStore('queue')
            .count().onsuccess = function(e) {
          var count = e.target.result;
          if (count == 0) {
            deferred.reject('Add tracks to queue before shuffling!');
            return;
          }
          var indices = [];
          for (var i = 1; i <= count; i++) {
            indices.push(i);
          }
          var tmp, current;
          while(--count) {
            current = Math.floor(Math.random() * (count + 1));
            tmp = indices[current];
            indices[current] = indices[count];
            indices[count] = tmp;
          }
          transaction.objectStore('queue')
              .openCursor().onsuccess = function(e) {
            var cursor = e.target.result;
            if (cursor) {
              var item = cursor.value;
              item.index = indices.pop();
              cursor.update(item);
              cursor.continue();
            } else {
              transaction.oncomplete = function() {
                deferred.resolve();
              }
            }
          };
        }
      });
      return deferred.promise();
    },

    remove: function(track) {
      var deferred = $.Deferred();
      $.when(Db.dbPromise()).then(function(db) {
        db.transaction("queue", "readwrite").objectStore("queue").index("ixIndex")
            .openCursor(IDBKeyRange.only(track.index)).onsuccess = function(e) {
          var cursor = e.target.result;
          if (cursor) {
            cursor.delete().onsuccess = function() {
              deferred.resolve();
            };
          }
        };
      });

      return deferred.promise();
    },

    /**
    * Nested db updates seem to not work well with indices,
    * ergo the then at the end
    */
    clean: function() {
      var deferred = $.Deferred();
      $.when(Db.dbPromise()).then(function(db) {
        var transaction = db.transaction("queue", 'readwrite');
        transaction.objectStore("queue")
            .openCursor().onsuccess = function(e) {
          var cursor = e.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            transaction.oncomplete = function() {
              deferred.resolve(db);
            };
          }
        };
      });
      return deferred.promise();
    }
  };
}]);
