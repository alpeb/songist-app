songist.controller('TracksCtrl', ['$scope', '$location', '$route', 'Tracks', function($scope, $location, $route, Tracks) {
  $scope.tracks = [];
  $scope.lowerBound = 1;
  $scope.upperBound = $scope.lowerBound + recordsPerpage - 1;

  /**
  * Only one concurrent search allowed to avoid race conditions
  */
  var loadTracks = function(paginating) {
    var query = $location.search().q;
    if (query) {
      console.log('Searching for "' + query + '"');
    }
    $scope.finishedSearch.finished = false;
    $('#tracksNotFound').hide();
    $('#tracksTable').hide();
    $('#tracksSpinner').show();
    $.when(Tracks.getTracks(
        $scope.genre.name,
        $scope.artist.name,
        $scope.album.name,
        $scope.lowerBound,
        $scope.upperBound,
        query)).then(function(tracks) {
      // I cannot wrap all this with $scope.$apply() because I need the template to be rendered with the tracks before $scope.initTracksDraggables is called
      if (tracks && tracks.length > 0) {
        $('#tracksNotFound').hide();
        $('#tracksTable').show();
        $scope.tracks.push.apply($scope.tracks, tracks);
        $scope.$apply();
      } else if (!paginating) {
        $('#tracksNotFound').show();
      } else {
        $('#tracksTable').show();
      }
      $('#tracksSpinner').hide();
      $scope.finishedSearch.finished = true;
      if ($scope.lastSearch.key && $scope.lastSearch.key != query) {
        $location.path('/tracks');
        $location.search({q: $scope.lastSearch.key});
        $scope.lastSearch.key = null;
        $scope.$apply();
      } else {
        $scope.initTracksDraggables();
        $scope.lastSearch.key = null;
      }
    }, function(error) {
      console.log("ERROR: ", error);
    });
  };

  $scope.loadMore = function() {
    $scope.lowerBound = $scope.upperBound + 1;
    $scope.upperBound = $scope.lowerBound + recordsPerpage - 1;
    loadTracks(true);
  };

  $('#filters').css('visibility', 'visible');

  loadTracks();
  $scope.adjustHeight(150);

  $scope.$on('addTrack', function(e, track) {
    var query = $location.search().q;
    if (query) {
      query = query.toLowerCase();
    }
    if ($location.path() == '/tracks'
        && (!$scope.genre.name || $scope.genre.name == track.genre)
        && (!$scope.artist.name || $scope.artist.name == track.artist)
        && (!$scope.album.name || $scope.album.name == track.album)
        && (!query
          || track.genre.indexOf(query) > -1
          || track.artist.indexOf(query) > -1
          || track.album.indexOf(query) > -1
          || track.title.toLowerCase().indexOf(query) > -1)) {
      $scope.$apply(function() {
        $scope.tracks.push(track);
        if (query) {
          $('#tracksNotFound').hide();
          $('#tracksTable').show();
        }
      });
    }
  });
  Tracks.setTracksCtrlScope($scope);
  
  console.log('View: Tracks');
}]);

