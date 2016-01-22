songist.factory('Albums', ['Db', function(Db) {
  var update = function(album) {
    var deferred = $.Deferred();
    $.when(Db.dbPromise()).then(function(db) {
       var transaction = db.transaction("albums", "readwrite");
       transaction.objectStore("albums").put(album).onsuccess = function(e) {
         deferred.resolve(album);
       }
    });
    return deferred.promise();
  };

  return {
    getAlbums: function(genre, artist, lower, upper, onlyNames) {
      var deferred = $.Deferred();
      var albums = [];
      $.when(Db.dbPromise()).then(function(db) {
        var index = 0;
        var objectStore = db.transaction("albums").objectStore("albums");
        var request;
        if (artist) {
          request = objectStore.index("ixArtist").openCursor(IDBKeyRange.only(artist));
        } else if (genre) {
          request = objectStore.index("ixGenre").openCursor(IDBKeyRange.only(genre));
        } else {
          request = objectStore.openCursor();
        }
        objectStore.openCursor().onsuccess = function(e) {
          var cursor = e.target.result;
          if (cursor) {
            if ((!genre || genre == cursor.value.genre)
                && (!artist || artist == cursor.value.artist)) {
              index++;
              if (index < lower) {
                cursor.continue();
              } else if (upper && index > upper) {
                deferred.resolve(albums);
              } else {
                if (onlyNames) {
                  albums.push(cursor.value.name);
                } else {
                  albums.push(cursor.value);
                }
                cursor.continue();
              }
            } else {
              cursor.continue();
            }
          } else {
            deferred.resolve(albums);
          }
        }
      }, function(error) {
        console.log("ERROR: ", error);
      });

      return deferred.promise();
    },

    updateAll: function() {
      console.log("updating albums");
      var deferred = $.Deferred();
      $.when(Db.dbPromise()).then(function(db) {
        var transaction =  db.transaction(["albums", "tracks"], "readwrite");
        var objectStore = transaction.objectStore("albums");
        objectStore.openCursor().onsuccess = function(e) {
          var cursor = e.target.result;
          if (cursor) {
            transaction.objectStore("tracks")
                .index("ixAlbum")
                .openCursor(IDBKeyRange.only(cursor.value.name)).onsuccess = function(e) {
              if (!e.target.result) {
                console.log("deleting album " + cursor.value.name);
                objectStore.delete(cursor.value.name).onsuccess = function() {
                  cursor.continue();
                };
              } else {
                cursor.continue();
              }
            };
          } else {
            deferred.resolve();
          }
        };
      });
      return deferred.promise();
    },

    /**
    * This function fetches the artist's art AND saves it to the db
    */
    fetchArt: function(album) {
      console.log('Fetching art for artist ' + album.artist + ', album ' + album.name);
      var deferred = $.Deferred();
      album.art_fetched = true;
      if (album.name == '') {
        $.when(update(album)).then(function(album) {
          deferred.resolve(album);
        });
      } else {
        var artReader = new FileReader();

        // don't wanna go into Angular's digest cycle, so not using $http
        $.get(
          'http://pulptunes.com/api/art/album',
          {
            artist: album.artist,
            album: album.name
          }
        ).success(function(data) {
            if (data.uri) {
              var xhr = new XMLHttpRequest();
              xhr.open('GET', data.uri, true);
              xhr.responseType = 'blob';
              xhr.onload = function(e) {
                artReader.onloadend = function() {
                  album.art = this.result;
                  $.when(update(album)).then(function(album) {
                    deferred.resolve(album);
                  });
                }
                artReader.readAsDataURL(this.response);
              };
              xhr.send();
            } else {
              $.when(update(album)).then(function(album) {
                deferred.resolve(album);
              });
            }
          }
        ).fail(function() {
          console.log('Error fetching artist: ' + album.artist + ', album ' + album.name);
          deferred.reject(album);
        });
      }
      return deferred.promise();
    }
  };
}]);
