songist.controller('ArtistsCtrl', ['$scope', '$location', 'Artists', 'Tracks', function($scope, $location, Artists, Tracks) {

  $scope.artists = [];
  $scope.lowerBound = 1;
  $scope.upperBound = $scope.lowerBound + recordsPerpage - 1;
  $scope.fetchingArt = false;
  $scope.fetchedArt = 0;

  var fetchArt = function() {
    if (navigator.onLine && !$scope.fetchingArt) {
      $scope.fetchingArt = true;
      while ($scope.fetchedArt < $scope.artists.length && $scope.artists[$scope.fetchedArt].art_fetched) {
        $scope.fetchedArt++;
      }
      if ($scope.fetchedArt < $scope.artists.length) {
        setTimeout(fetchArt2, 100);
      } else {
        $scope.fetchingArt = false;
      }
    }
  };

  var loadArtists = function() {
    $.when(
      Artists.getArtists($scope.genre.name, $scope.lowerBound, $scope.upperBound)
    ).then(function(artists) {
      $scope.$apply(function() {
        $scope.artists.push.apply($scope.artists, artists);
      });
    }, function(error) {
      console.log("ERROR: ", error);
    }).then(fetchArt);
  }

  $scope.loadMore = function() {
    $scope.lowerBound = $scope.upperBound + 1;
    $scope.upperBound = $scope.lowerBound + recordsPerpage - 1;
    loadArtists();
  };

  // CSP workaround
  $scope.clickArtist = function(artist) {
    $scope.artist.name = artist.name;
    $scope.album.name = null;
    $location.path('/albums');
  };

  $('#filters').css('visibility', 'visible');

  $scope.resetSearch();
  loadArtists();
  $scope.adjustHeight();

  $scope.$on('addArtist', function(e, artist) {
    if ($location.path() == '/artists'
        && (!$scope.genre.name || $scope.genre.name == artist.genre)) {
      $scope.$apply(function() {
        $scope.artists.push(artist);
      });
      fetchArt();
    }
  });
  Tracks.setArtistsCtrlScope($scope);

  console.log('View: Artists');

  /**
  * I'm gonna fetch art sequentially to avoid making too many connections
  */
  var fetchArt2 = function() {
    if ($location.path() != '/artists') {
      // don't wanna keep on fetching stuff in the background when in another
      // section of the app.
      $scope.fetchingArt = false;
      return;
    }

    $.when(Artists.fetchArt($scope.artists[$scope.fetchedArt])).always(function(artist) {
      $scope.$apply(function() {
        $scope.artists[$scope.fetchedArt] = artist;
        while ($scope.fetchedArt < $scope.artists.length && $scope.artists[$scope.fetchedArt].art_fetched) {
          $scope.fetchedArt++;
        }
        if ($scope.fetchedArt < $scope.artists.length) {
          setTimeout(fetchArt2, 100);
        } else {
          $scope.fetchingArt = false;
        }
      });
    });
  };
}]);
