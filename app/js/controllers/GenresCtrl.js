songist.controller('GenresCtrl', ['$scope', '$rootScope', '$location', 'Genres', 'Tracks', 'Db', function($scope, $rootScope, $location, Genres, Tracks, Db) {

  // When clicking on the genre name I'm not gonna reset the genres filter
  //$scope.genre.name = null;

  $scope.genres = [];
  $scope.lowerBound = 1;
  $scope.upperBound = $scope.lowerBound + recordsPerpage - 1;
  $scope.fetchingArt = false;
  $scope.fetchedArt = 0;

  var fetchArt = function() {
    $scope.$apply(function() {
      if (navigator.onLine && !$scope.fetchingArt) {
        $scope.fetchingArt = true;
        while ($scope.fetchedArt < $scope.genres.length && $scope.genres[$scope.fetchedArt].art_built) {
          $scope.fetchedArt++;
        }
        if ($scope.fetchedArt < $scope.genres.length) {
          setTimeout(fetchArt2, 100);
        } else {
          $scope.fetchingArt = false;
        }
      }
    });
  };

  $scope.loadGenres = function() {
    $.when(Genres.getGenres($scope.lowerBound, $scope.upperBound))
        .then(function(genres) {
      $scope.$apply(function() {
        $scope.genres.push.apply($scope.genres, genres);
      });
    }, function(error) {
      console.log("ERROR: ", error);
    }).then(fetchArt);
  };

  $scope.loadMore = function() {
    $scope.lowerBound = $scope.upperBound + 1;
    $scope.upperBound = $scope.lowerBound + recordsPerpage - 1;
    $scope.loadGenres();
  };

  // CSP workaround
  $scope.clickGenre = function(genre) {
    $scope.genre.name = genre.name;
    $scope.artist.name = null;
    $scope.album.name = null;
    $location.path('/artists');
  };

  /**
  * I'm gonna fetch art sequentially to avoid making too many connections.
  * This is done when the genres are shown instead of when the files are processed
  * because I fetch artists art if there isn't enough album art
  */
  var fetchArt2 = function() {
    if ($location.path() != '/genres') {
      // don't wanna keep on fetching stuff in the background when in another
      // section of the app.
      $scope.fetchingArt = false;
      return;
    }

    var genre = $scope.genres[$scope.fetchedArt];
    var mosaics;
    console.log('Building art for genre ' + genre.name);
    $.when(function() {
      if (genre.mosaics.length < 4) {
        return Genres.fillRemainingMosaicsWithArtistArt(genre);
      } else {
        var deferred = $.Deferred();
        deferred.resolve(genre);
        return deferred.promise();
      }
    }()).then(function(genre) {
      mosaics = genre.mosaics;
      var deferred = $.Deferred();
      var handleImageError = function() {
        deferred.resolve(genre);
      };
      if (mosaics.length == 0) {
        deferred.resolve(genre);
      } else if (mosaics.length == 1) {
        genre.art = mosaics[0];
        deferred.resolve(genre);
      } else {
        var canvas = document.createElement('canvas');
        canvas.setAttribute('width', 210);
        canvas.setAttribute('height', 210);
        var ctx = canvas.getContext('2d');
        var img = new Image();
        img.src = mosaics[0];

        if (mosaics.length == 2) {
          img.onload = function() {
            ctx.drawImage(img, 0, 0, 125, 125);
            img.src = mosaics[1];
            img.onload = function() {
              ctx.drawImage(img, 85, 85, 125, 125);
              genre.art = canvas.toDataURL();
              deferred.resolve(genre);
            };
            img.onerror = handleImageError;
          };
          img.onerror = handleImageError;
        } else if (mosaics.length == 3) {
          img.onload = function() {
            ctx.drawImage(img, 0, 85, 125, 125);
            img.src = mosaics[1];
            img.onload = function() {
              ctx.drawImage(img, 85, 0, 125, 125);
              img.src = mosaics[2];
              img.onload = function() {
                ctx.drawImage(img, 125, 125, 85, 85);
                genre.art = canvas.toDataURL();
                deferred.resolve(genre);
              };
              img.onerror = handleImageError;
            };
            img.onerror = handleImageError;
          };
          img.onerror = handleImageError;
        } else {
          // mosaics' length must be 4
          img.onload = function() {
            ctx.drawImage(img, 0, 85, 125, 125);
            img.src = mosaics[1];
            img.onload = function() {
              ctx.drawImage(img, 85, 0, 125, 125);
              img.src = mosaics[2];
              img.onload = function() {
                ctx.drawImage(img, 125, 125, 85, 85);
                img.src = mosaics[3];
                img.onload = function() {
                  ctx.drawImage(img, 0, 0, 85, 85);
                  genre.art = canvas.toDataURL();
                  deferred.resolve(genre);
                };
                img.onerror = handleImageError;
              };
              img.onerror = handleImageError;
            };
            img.onerror = handleImageError;
          };
          img.onerror = handleImageError;
        }
      }
      return deferred.promise();
    }).then(function(genre) {
      genre.art_built = true;
      return Genres.save(genre);
    }).then(function(genre) {
      $scope.$apply(function() {
        $scope.genres[$scope.fetchedArt] = genre;
      });
      while ($scope.fetchedArt < $scope.genres.length && $scope.genres[$scope.fetchedArt].art_built) {
        $scope.fetchedArt++;
      }
      if ($scope.fetchedArt < $scope.genres.length) {
        setTimeout(fetchArt2, 100);
      } else {
        $scope.fetchingArt = false;
      }
    });
  };

  $scope.resetSearch();

  $scope.$on('addGenre', function(e, genre) {
    if ($location.path() == '/genres') {
      $scope.$apply(function() {
        $scope.genres.push(genre);
      });
      fetchArt();
    }
  });
  Tracks.setGenresCtrlScope($scope);

  var start = function() {
    // avoid loading playlists and genres at the same time
    if (!$scope.playlists.playlists) {
      $scope.loadPlaylists().then(function() {
        $scope.loadGenres();
      });
    } else {
      $scope.loadGenres();
    }
  };

  if ($scope.isNewDb.isNewDb === null) {
    $.when(Db.isNewDb()).then(function(isNew) {
      $scope.$apply(function() {
        $scope.isNewDb.isNewDb = isNew;
        if (isNew) {
          console.log("Database is new");

          // events were not being sent with just $scope...
          Db.setScope($rootScope);

          $('#rightContainer').hide();
          $('#intro').show();
        } else {
          console.log("Database already exists");
          start();
        }
      });
    });
  } else {
    start();
  }

  $scope.adjustHeight();
}]);
