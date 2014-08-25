/**
* Note that JQuery's deferred is prefered to Angular's $q cuz we don't need the full digest cycle to run here
*/
songist.factory('Tracks', ['Db', 'Genres', 'Artists', 'Albums', function(Db, Genres, Artists, Albums) {
  var genres = [];
  var artists = [];
  var albums = [];
  var homeCtrlScope;
  var genresCtrlScope;
  var artistsCtrlScope;
  var albumsCtrlScope;
  var tracksCtrlScope;

  return {
    setHomeCtrlScope: function(theScope) {
      homeCtrlScope = theScope;
    },

    setGenresCtrlScope: function(theScope) {
      genresCtrlScope = theScope;
    },

    setArtistsCtrlScope: function(theScope) {
      artistsCtrlScope = theScope;
    },

    setAlbumsCtrlScope: function(theScope) {
      albumsCtrlScope = theScope;
    },

    setTracksCtrlScope: function(theScope) {
      tracksCtrlScope = theScope;
    },

    resetCaches: function() {
      var that = this;
      var deferred = $.Deferred();
      $.when(Genres.getGenres(0, null, true)).then(function(arrGenres) {
        genres = arrGenres;
        $.when(Artists.getArtists(null, 0, null, true)).then(function(arrArtists) {
          artists = arrArtists;
          $.when(Albums.getAlbums(null, null, 0, null, true)).then(function(arrAlbums) {
            albums = arrAlbums;
            deferred.resolve();
          });
        });
      });
      return deferred.promise();
    },

    isNew: function(fileEntry, scanId) {
      var deferred = $.Deferred();
      //console.log("looking for " + fileEntry.fullPath);
      $.when(Db.dbPromise()).then(function(db) {
        var objectStore = db.transaction("tracks", "readwrite").objectStore("tracks");
        objectStore.get(fileEntry.fullPath).onsuccess = function(e) {
          var track = e.target.result;
          if (!track) {
            deferred.resolve(fileEntry);
          } else {
            var mData = chrome.mediaGalleries.getMediaFileSystemMetadata(fileEntry.filesystem);
            if (track.gallery == mData.name) {
              track.scanId = scanId;
              objectStore.put(track).onsuccess = function() {
                deferred.resolve(null);
              };
            } else {
              deferred.resolve(fileEntry);
            }
          }
        };
      });
      return deferred.promise();
    },

    getTracks: function(genre, artist, album, lower, upper, query) {
      //console.log("getTracks(" + genre + ", " + artist + ", " + album + ", " + lower + ", " + upper + ")");
      if (query) {
        query = query.toLowerCase();
      }
      var deferred = $.Deferred();
      var tracks = [];
      $.when(Db.dbPromise()).then(function(db) {
        var index = 0;
        var objectStore = db.transaction("tracks").objectStore("tracks");
        var request;
        if (album) {
          request = objectStore.index("ixAlbum").openCursor(IDBKeyRange.only(album));
        } else if (artist) {
          request = objectStore.index("ixArtist").openCursor(IDBKeyRange.only(artist));
        } else if (genre) {
          request = objectStore.index("ixGenre").openCursor(IDBKeyRange.only(genre));
        } else {
          request = objectStore.openCursor();
        }
        request.onsuccess = function(e) {
          var cursor = e.target.result;
          if (cursor) {
            if ((!genre || genre == cursor.value.genre)
                && (!artist || artist == cursor.value.artist)
                && (!album || album == cursor.value.album)
                && (!query
                  || cursor.value.genre.indexOf(query) > -1
                  || cursor.value.artist.indexOf(query) > -1
                  || cursor.value.album.indexOf(query) > -1
                  || cursor.value.title.toLowerCase().indexOf(query) > -1)) {
              index++;
              //console.log("index:", index);
              if (index < lower) {
                cursor.continue();
              } else if (index > upper) {
                deferred.resolve(tracks);
              } else {
                tracks.push(cursor.value);
                cursor.continue();
              }
            } else {
              cursor.continue();
            }
          } else {
            deferred.resolve(tracks);
          }
        };
      });

      return deferred.promise();
    },

    getNext: function(currentTrack, genre, artist, album, query) {
      if (query) query = query.toLowerCase();
      var deferred = $.Deferred();
      $.when(Db.dbPromise()).then(function(db) {
        var next = false;
        db.transaction("tracks")
            .objectStore("tracks")
            .openCursor().onsuccess = function(e) {
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
              if (!currentTrack) {
                deferred.resolve(track);
              } else if (track.path == currentTrack.path) {
                next = true;
                cursor.continue();
              } else if (next) {
                deferred.resolve(track);
              } else {
                cursor.continue();
              }
            } else {
              cursor.continue();
            }
          } else {
            deferred.resolve(null);
          }
        };
      });

      return deferred.promise();
    },

    add: function(track, capitalizedNames) {
      //console.log("adding track:", track);
      var deferred1 = $.Deferred();
      var transaction;
      $.when(Db.dbPromise()).then(function(db) {
         var deferred2 = $.Deferred();
         transaction = db.transaction(["genres", "artists", "albums", "tracks"], "readwrite");
         if (track.genre == "" || $.inArray(track.genre, genres) > -1) {
           deferred2.resolve(track);
         } else {
           var genre = {
             name: track.genre,
             mosaics: [],
             art: '../../img/genre.png',
             art_built: false
           };
           genres.push(genre.name);
           transaction.objectStore("genres").put(genre).onsuccess = function(e) {
             homeCtrlScope.$broadcast('ecanMsg', 'Genre "' + capitalizedNames.genre + '"');
             genresCtrlScope.$broadcast('addGenre', genre);
             deferred2.resolve(track);
           }
         }
         return deferred2.promise();
      }, function(error) {
        console.log("ERROR: ", error);
      }).then(function(track) {
         var deferred3 = $.Deferred();
         if (track.artist == "" || $.inArray(track.artist, artists) > -1) {
           deferred3.resolve(track);
         } else {
           var artist = {
             name: track.artist,
             genre: track.genre,
             art: '../../img/artist.png',
             art_fetched: false
           };
           artists.push(track.artist);
           transaction.objectStore("artists").put(artist).onsuccess = function(e) {
             homeCtrlScope.$broadcast('scanMsg', 'Artist "' + capitalizedNames.artist + '"');
             // artistsCtrlScope won't not be defined yet if we haven't clicked on the Artists tab
             if (artistsCtrlScope) {
               artistsCtrlScope.$broadcast('addArtist', artist);
             }
             deferred3.resolve(track);
           }
         }

         return deferred3.promise();
      }).then(function(track) {
         var deferred4 = $.Deferred();
         if (track.album == "" || $.inArray(track.album, albums) > -1) {
           deferred4.resolve(track);
         } else {
           var album = {
             name: track.album,
             genre: track.genre,
             artist: track.artist,
             art: track.art,
             art_fetched: track.art? true : false
           };
           albums.push(track.album);
           transaction.objectStore("albums").put(album).onsuccess = function(e) {
             homeCtrlScope.$broadcast('scanMsg', 'Album "' + capitalizedNames.album + '"');
             // albumsCtrlScope won't not be defined yet if we haven't clicked on the Albums tab
             if (albumsCtrlScope) {
               albumsCtrlScope.$broadcast('addAlbum', album);
             }
             deferred4.resolve(track);
           }
         }

         return deferred4.promise();
      }).then(function(track) {
         transaction.objectStore("tracks").add(track).onsuccess = function(e) {
           // tracksCtrlScope won't not be defined yet if we haven't clicked on the Tracks tab
           if (tracksCtrlScope) {
             tracksCtrlScope.$broadcast('addTrack', track);
           }
           deferred1.resolve(track);
         }
      });
      return deferred1.promise();
    },

    /**
    * Attempts to retrieve album art. If none, attempts to retrieve artist image.
    */
    getArt: function(track) {
      var deferred = $.Deferred();
      $.when(Db.dbPromise()).then(function(db) {
        if (track.album) {
          db.transaction("albums").objectStore("albums")
              .get(track.album).onsuccess = function(e) {
            if (e.target.result && e.target.result.art) {
              deferred.resolve(e.target.result.art);
            } else {
              $.when(Artists.getArt(track.artist)).then(function(art) {
                deferred.resolve(art);
              });
            }
          }
        } else {
          $.when(Artists.getArt(track.artist)).then(function(art) {
            deferred.resolve(art);
          });
        }
      });
      return deferred.promise();
    },

    deleteFiles: function(arrGalleryNames, scanId) {
      console.log("Deleting orphaned entries");
      var deferred = $.Deferred();
      $.when(Db.dbPromise()).then(function(db) {
        var transaction = db.transaction(["tracks", "playlists", "queue"], "readwrite");
        transaction.objectStore("tracks").openCursor().onsuccess = function(e) {
          var cursor = e.target.result;
          if (cursor) {
            var track = cursor.value;
            if (track.scanId != scanId || $.inArray(track.gallery, arrGalleryNames) == -1) {
              console.log("deleting ", track.title);
              cursor.delete()
              cursor.continue();

              transaction.objectStore("playlists").index("ixPath")
                  .openCursor(IDBKeyRange.only(track.path)).onsuccess = function(e) {
                var cursor2 = e.target.result;
                if (cursor2) {
                  cursor2.delete();
                  cursor2.continue(); // in case there are dupes
                }
              }

              transaction.objectStore("queue").index("ixPath")
                  .openCursor(IDBKeyRange.only(track.path)).onsuccess = function(e) {
                var cursor3 = e.target.result;
                if (cursor3) {
                  cursor3.delete();
                  cursor3.continue(); // in case there are dupes
                }
              }
            } else {
              cursor.continue();
            }
          } else {
            transaction.oncomplete = function() {
              deferred.resolve();
            }
          }
        };
      });

      return deferred.promise();
    }
  };
}]);
