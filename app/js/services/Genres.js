songist.factory('Genres', ['Db', 'Artists', 'Albums', function(Db, Artists, Albums) {
  var module = {
    getGenres: function(lower, upper, onlyNames) {
      var deferred = $.Deferred();
      var genres = [];
      $.when(Db.dbPromise()).then(function(db) {
        var index = 0;
        db.transaction("genres").objectStore("genres")
            .openCursor().onsuccess = function(e) {
          var cursor = e.target.result;
          if (cursor) {
            index++;
            if (index < lower) {
              cursor.continue();
            } else if (upper && index > upper) {
              deferred.resolve(genres);
            } else {
              if (onlyNames) {
                genres.push(cursor.value.name);
              } else {
                genres.push(cursor.value);
              }
              cursor.continue();
            }
          } else {
            deferred.resolve(genres);
          }
        }
      }, function(error) {
        console.log("ERROR: ", error);
      });

      return deferred.promise();
    },

    save: function(genre) {
      var deferred = $.Deferred();
      $.when(Db.dbPromise()).then(function(db) {
        db.transaction("genres", "readwrite").objectStore("genres").put(genre).onsuccess = function(e) {
          deferred.resolve(genre);
        };
      });
      return deferred.promise();
    },

    /**
    * I couldn't make it work with nested db calls; that's the reason for the nasty 'then' at the end
    */
    updateAll: function() {
      console.log("Updating genres");
      var deferred = $.Deferred();
      var genresToUpdate = [];
      $.when(Db.dbPromise()).then(function(db) {
        var deferred2 = $.Deferred();
        var transaction = db.transaction(["genres", "tracks"], "readwrite");
        var objectStore = transaction.objectStore("genres");
        objectStore.openCursor().onsuccess = function(e) {
          var cursorGenres = e.target.result;
          if (cursorGenres) {
            var genre = cursorGenres.value;
            var firstTrack = true;
            transaction.objectStore("tracks").index("ixGenre")
                .openCursor(IDBKeyRange.only(genre.name)).onsuccess = function(e) {
              var cursorTracks = e.target.result;
              if (firstTrack && !cursorTracks) {
                console.log("Deleting genre " + genre.name);
                objectStore.delete(genre.name).onsuccess = function() {
                  cursorGenres.continue();
                };
              } else if (!cursorTracks) {
                cursorGenres.continue();
              } else {
                var track = cursorTracks.value;
                var mosaics = genre.mosaics;
                firstTrack = false;
                if (mosaics.length < 4) {
                  if (track.art && $.inArray(track.art, mosaics) == -1) {
                    console.log("Adding track art to genre " + genre.name);
                    mosaics.push(track.art);
                    genre.mosaics = mosaics;
                    genre.art_built = false;
                    genresToUpdate.push(genre);
                  }
                  cursorTracks.continue();
                } else {
                  cursorGenres.continue();
                }
              }
            };
          } else {
            deferred2.resolve();
          }
        };
        return deferred2.promise();
      }).then(function() {
        var saveGenre = function() {
          if (genresToUpdate.length > 0) {
            // reference to this is lost here (even if using var that = this before, so gotta use module
            $.when(module.save(genresToUpdate.shift())).then(function() {
              setTimeout(saveGenre);
            });
          } else {
            deferred.resolve();
          }
        }
        saveGenre();
      });

      return deferred.promise();
    },

    /**
    * This function doesn't save anything, it just returns a more complete genre object
    */
    fillRemainingMosaicsWithArtistArt: function(genre) {
      console.log("Filling remaining mosaics with artist art");
      var deferred = $.Deferred();
      var mosaics = genre.mosaics;
      var pendingArtists = [];
      var pendingAlbums = [];
      $.when(Db.dbPromise()).then(function(db) {
        var deferred2 = $.Deferred();
        db.transaction("artists").objectStore("artists").index("ixGenre")
            .openCursor(IDBKeyRange.only(genre.name)).onsuccess = function(e) {
          var cursor = e.target.result;
          if ((mosaics.length + pendingArtists.length) >= 4) {
            deferred2.resolve(db);
          } else if (cursor) {
            var artist = cursor.value;
            if (artist.art_fetched) {
              if (artist.art != '../../img/artist.png' && $.inArray(artist.art, mosaics) == -1) {
                mosaics.push(artist.art);
              }
            } else {
              pendingArtists.push(artist);
            }
            cursor.continue();
          } else {
            deferred2.resolve(db);
          }
        };
        return deferred2.promise();
      }).then(function(db) {
        var deferred2 = $.Deferred();
        var fetchArtistArt = function() {
          if (pendingArtists.length == 0) {
            if (genre.mosaics.length < mosaics.length) {
              genre.art_built = false;
            }
            genre.mosaics = mosaics;
            deferred2.resolve(db);
          } else {
            $.when(Artists.fetchArt(pendingArtists.shift())).then(function(artist) {
              if (artist.art != '../../img/artist.png') {
                mosaics.push(artist.art);
              }
              setTimeout(fetchArtistArt);
            });
          }
        };
        fetchArtistArt();
        return deferred2.promise();
      }).then(function(db) {
        var deferred2 = $.Deferred();
        db.transaction("albums").objectStore("albums").index("ixGenre")
            .openCursor(IDBKeyRange.only(genre.name)).onsuccess = function(e) {
          var cursor = e.target.result;
          if ((mosaics.length + pendingAlbums.length) >= 4) {
            deferred2.resolve();
          } else if (cursor) {
            var album = cursor.value;
            if (album.art_fetched) {
              if (album.art && $.inArray(album.art, mosaics) == -1) {
                mosaics.push(album.art);
              }
            } else {
              pendingAlbums.push(album);
            }
            cursor.continue();
          } else {
            deferred2.resolve();
          }
        };
        return deferred2.promise();
      }).then(function() {
        var fetchAlbumArt = function() {
          if (pendingAlbums.length == 0) {
            if (genre.mosaics.length < mosaics.length) {
              genre.art_built = false;
            }
            genre.mosaics = mosaics;
            deferred.resolve(genre);
          } else {
            $.when(Albums.fetchArt(pendingAlbums.shift())).then(function(album) {
              if (album.art) {
                mosaics.push(album.art);
              }
              setTimeout(fetchAlbumArt);
            });
          }
        }
        fetchAlbumArt();
      });
      return deferred.promise();
    }
  };
  return module;
}]);

