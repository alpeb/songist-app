songist.controller('PlaylistsCtrl', ['$scope', '$route', '$routeParams', '$location', 'Tracks', 'Playlists', function($scope, $route, $routeParams, $location, Tracks, Playlists) {
  $scope.tracks = [];
  $scope.lowerBound = 1;
  $scope.upperBound = $scope.lowerBound + recordsPerpage - 1;

  $scope.playlist = {playlist: $routeParams.playlist};

  var loadTracks = function(paginating) {
    $('#tracksNotFound').hide();
    $('#tracksTable').hide();
    $('#tracksSpinner').show();
    $.when(Playlists.getTracks(
        $scope.playlist.playlist,
        $scope.lowerBound,
        $scope.upperBound)).then(function(tracks) {
      $scope.$apply(function() {
        if (tracks && tracks.length > 0) {
          $('#tracksNotFound').hide();
          $('#tracksTable').show();
          $scope.tracks.push.apply($scope.tracks, tracks);
        } else if (!paginating) {
          $('#tracksNotFound').show();
        } else {
          $('#tracksTable').show();
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

  $scope.deletePlaylist = function() {
    $.when(Playlists.deleteTrack(
      $scope.playlist.playlist)
    ).then(function() {
      $scope.msg('Playlist "' + $scope.playlist.playlist + '" has been deleted');
      $.when($scope.loadPlaylists()).then(function() {
        $scope.$apply(function() {
          $location.path('/genres');
        });
      });
    });
  };

  /**
  * Couldn't use jquery here cuz click() trigger won't work
  */
  $scope.exportPlaylist = function() {
    $.when(Playlists.getTracks($scope.playlist.playlist)).then(function(tracks) {
      var text = '#EXTM3U\r\n';
      $.each(tracks, function(index, track) {
        text += '#EXTINF:-1,' + track.title + ' - ' + track.artist + '\r\n';
        text += track.path + '\r\n';
      });

      var blob = new Blob([text], {type: 'text/plain'});
      var link = document.getElementById('downloadPlaylistLink');
      link.href = window.URL.createObjectURL(blob);
      link.download = $scope.playlist.playlist + '.m3u';
      link.click();
    });
  };

  $scope.removeFromPlaylist = function(track) {
    $.when(Playlists.deleteTrack(
      $scope.playlist.playlist,
      track.path)
    ).then(function() {
      $scope.$apply(function() {
        $route.reload();
      });
    });
  };

  $('#filters').css('visibility', 'hidden');

  loadTracks();
  $scope.adjustHeight(175);
  console.log('View: Playlist');
}]);
