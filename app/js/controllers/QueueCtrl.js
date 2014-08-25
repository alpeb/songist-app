songist.controller('QueueCtrl', ['$scope', '$location', '$route', 'Tracks', 'Queue', function($scope, $location, $route, Tracks, Queue) {
  $scope.tracks = [];
  $scope.lowerBound = 1;
  $scope.upperBound = $scope.lowerBound + recordsPerpage - 1;

  var loadTracks = function(paginating) {
    $('#tracksNotFound').hide();
    $('#tracksTable').hide();
    $('#cleanRow').hide();
    $('#tracksSpinner').show();
    $.when(Queue.getQueue(
        $scope.lowerBound,
        $scope.upperBound)).then(function(tracks) {
      $scope.$apply(function() {
        if (tracks && tracks.length > 0) {
          $('#tracksNotFound').hide();
          $('#tracksTable').show();
          $('#cleanRow').show();
          $scope.tracks.push.apply($scope.tracks, tracks);
        } else if (!paginating) {
          $('#tracksNotFound').show();
        } else {
          $('#tracksTable').show();
          $('#cleanRow').show();
        }
        $('#tracksSpinner').hide();
        $scope.initTracksDraggables();
      });
    }, function(error) {
      console.log("ERROR: ", error);
    });
  };

  $scope.loadMore = function() {
    $scope.lowerBound = $scope.upperBound + 1;
    $scope.upperBound = $scope.lowerBound + recordsPerpage - 1;
    loadTracks(true);
  };

  $scope.dequeue = function(track) {
    $.when(Queue.remove(track)).then(function() {
      // for some fucking reason in this case I gotta wait a bit for the 
      // indices to update
      setTimeout(function() {
        $scope.$apply(function() {
          $route.reload();
        });
      }, 100);
    });
  };

  $scope.cleanQueue = function() {
    $scope.msg('cleaning queue &nbsp;<i class="icon-spinner icon-spin"></i>', false);
    $.when(Queue.clean()).then(function() {
      $scope.$apply(function() {
        $route.reload();
        $scope.msg('Queue has been cleaned');
      });
    });
  };

  $('#filters').css('visibility', 'hidden');

  loadTracks();
  $scope.adjustHeight(175);
  console.log('View: Queue');
}]);


