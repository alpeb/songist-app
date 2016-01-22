songist.factory('Artists', ['Db', function(Db) {
  var update = function(artist) {
    var deferred = $.Deferred();
    $.when(Db.dbPromise()).then(function(db) {
       var transaction = db.transaction("artists", "readwrite");
       transaction.objectStore("artists").put(artist).onsuccess = function(e) {
         deferred.resolve(artist);
       }
    });
    return deferred.promise();
  };

  return {
    getArtists: function(genre, lower, upper, onlyNames) {
      var deferred = $.Deferred();
      var artists = [];
      $.when(Db.dbPromise()).then(function(db) {
        var index = 0;
        var objectStore = db.transaction("artists").objectStore("artists");
        var request;
        if (genre) {
          request = objectStore.index("ixGenre").openCursor(IDBKeyRange.only(genre));
        } else {
          request = objectStore.openCursor();
        }
        request.onsuccess = function(e) {
          var cursor = e.target.result;
          if (cursor) {
            var artist = cursor.value;
            if (artist.name != ''
                && (!genre || genre == cursor.value.genre)) {
              index++;
              if (index < lower) {
                cursor.continue();
              } else if (upper && index > upper) {
                deferred.resolve(artists);
              } else {
                if (onlyNames) {
                  artists.push(artist.name);
                } else {
                  artists.push(artist);
                }
                cursor.continue();
              }
            } else {
              cursor.continue();
            }
          } else {
            deferred.resolve(artists);
          }
        }
      }, function(error) {
        console.log("ERROR: ", error);
      });

      return deferred.promise();
    },

    /**
    * This function fetches the artist's art AND saves it to the db
    */
    fetchArt: function(artist) {
      console.log('Fetching art for artist ' + artist.name);
      var deferred = $.Deferred();
      artist.art_fetched = true;
      if (artist.name == '') {
        $.when(update(artist)).then(function(artist) {
          deferred.resolve(artist);
        });
      } else {
        var artReader = new FileReader();

        // don't wanna go into Angular's digest cycle, so not using $http
        $.get(
          'http://pulptunes.com/api/art/artist',
          {
            name: artist.name
          }
        ).success(function(data) {
            if (data.uri) {
              var xhr = new XMLHttpRequest();
              xhr.open('GET', data.uri, true);
              xhr.responseType = 'blob';
              xhr.onload = function(e) {
                artReader.onloadend = function() {
                  artist.art = this.result;
                  $.when(update(artist)).then(function(artist) {
                    deferred.resolve(artist);
                  });
                }
                artReader.readAsDataURL(this.response);
              };
              xhr.send();
            } else {
              $.when(update(artist)).then(function(artist) {
                deferred.resolve(artist);
              });
            }
          }
        ).fail(function() {
          console.log('Error fetching artist: ' + artist.name);
          deferred.reject(artist);
        });
      }
      return deferred.promise();
    },

    getArt: function(artistName) {
      var deferred = $.Deferred();
      if (artistName) {
        var that = this;
        $.when(Db.dbPromise()).then(function(db) {
          db.transaction("artists").objectStore("artists")
              .get(artistName).onsuccess = function(e) {
            var artist = e.target.result;
            if (artist) {
              if (artist.art_fetched) {
                if (artist.art != '../../img/artist.png') {
                  deferred.resolve(artist.art);
                } else {
                  deferred.resolve(null);
                }
              } else if (navigator.onLine) {
                $.when(that.fetchArt(artist)).then(function(artist) {
                  if (artist.art != '../../img/artist.png') {
                    deferred.resolve(artist.art);
                  } else {
                    deferred.resolve(null);
                  }
                }, function() {
                  deferred.resolve(null);
                });
              } else {
                deferred.resolve(null);
              }
            } else {
              deferred.resolve(null);
            }
          }
        });
      } else {
        deferred.resolve(null);
      }
      return deferred.promise();
    },

    updateAll: function() {
      console.log("updating artists");
      var deferred = $.Deferred();
      $.when(Db.dbPromise()).then(function(db) {
        var transaction =  db.transaction(["artists", "tracks"], "readwrite");
        var objectStore = transaction.objectStore("artists");
        objectStore.openCursor().onsuccess = function(e) {
          var cursor = e.target.result;
          if (cursor) {
            transaction.objectStore("tracks")
                .index("ixArtist")
                .openCursor(IDBKeyRange.only(cursor.value.name)).onsuccess = function(e) {
              if (!e.target.result) {
                console.log("deleting artist " + cursor.value.name);
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
    }
  };
}]);

