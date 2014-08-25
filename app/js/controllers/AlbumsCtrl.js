songist.controller('AlbumsCtrl', ['$scope', '$location', 'Albums', 'Tracks', function($scope, $location, Albums, Tracks) {

  $scope.albums = [];
  $scope.lowerBound = 1;
  $scope.upperBound = $scope.lowerBound + recordsPerpage - 1;
  $scope.fetchingArt = false;
  $scope.fetchedArt = 0;

  var fetchArt = function() {
    if (navigator.onLine && !$scope.fetchingArt) {
      $scope.fetchingArt = true;
      while ($scope.fetchedArt < $scope.albums.length && $scope.albums[$scope.fetchedArt].art_fetched) {
        $scope.fetchedArt++;
      }
      if ($scope.fetchedArt < $scope.albums.length) {
        setTimeout(fetchArt2, 100);
      } else {
        $scope.fetchingArt = false;
      }
    }
  };

  var loadAlbums = function() {
    $.when(Albums.getAlbums(
        $scope.genre.name,
        $scope.artist.name,
        $scope.lowerBound,
        $scope.upperBound)).then(function(albums) {
      $scope.$apply(function() {
        $scope.albums.push.apply($scope.albums, albums);
      });
    }, function(error) {
      console.log("ERROR: ", error);
    }).then(fetchArt);
  }

  $scope.loadMore = function() {
    $scope.lowerBound = $scope.upperBound + 1;
    $scope.upperBound = $scope.lowerBound + recordsPerpage - 1;
    loadAlbums();
  };

  // CSP workaround
  $scope.clickAlbum = function(album) {
    $scope.album.name = album.name;
    $location.path('/tracks');
  };

  $('#filters').css('visibility', 'visible');

  $scope.resetSearch();
  loadAlbums();
  $scope.adjustHeight();

  $scope.$on('addAlbum', function(e, album) {
    if ($location.path() == '/albums'
        && (!$scope.genre.name || $scope.genre.name == album.genre)
        && (!$scope.artist.name || $scope.artist.name == album.artist)) {
      $scope.$apply(function() {
        $scope.albums.push(album);
      });
      fetchArt();
    }
  });
  Tracks.setAlbumsCtrlScope($scope);

  console.log("View: Albums");

  /**
  * I'm gonna fetch art sequentially to avoid making too many connections
  */
  var fetchArt2 = function() {
    if ($location.path() != '/albums') {
      // don't wanna keep on fetching stuff in the background when in another
      // section of the app.
      $scope.fetchingArt = false;
      return;
    }

    $.when(Albums.fetchArt($scope.albums[$scope.fetchedArt])).always(function(album) {
      $scope.$apply(function() {
        $scope.albums[$scope.fetchedArt] = album;
        while ($scope.fetchedArt < $scope.albums.length && $scope.albums[$scope.fetchedArt].art_fetched) {
          $scope.fetchedArt++;
        }
        if ($scope.fetchedArt < $scope.albums.length) {
          setTimeout(fetchArt2, 100);
        } else {
          $scope.fetchingArt = false;
        }
      });
    });
  };
}]);
