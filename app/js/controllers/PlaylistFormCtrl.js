songist.controller('PlaylistFormCtrl', ['$scope', '$location', 'Playlists', function($scope, $location, Playlists) {
  $scope.newPlaylist = function(currentName) {
    $('#newPlaylistModal .btn').prop('disabled', false);
    $('#newPlaylistModal .statefulBtn').button('reset');
    if (currentName) {
      $('#currentPlaylistName').val(currentName);
      $('#playlistName').val(currentName);
    } else {
      $('#currentPlaylistName').val('');
      $('#playlistName').val('');
    }
    $('#newPlaylistModal input[type=file]').val('');
    $('#newPlaylistModal').modal('show');
    $('#playlistName').focus();
  };

  $scope.rename = function() {
    $scope.newPlaylist($scope.playlist.playlist);
  };

  $scope.save = function() {
    $('#newPlaylistModal .btn').prop('disabled', true);
    var oldName = $('#currentPlaylistName').val();
    var name = $('#playlistName').val().trim();
    var file = $('#newPlaylistModal input[type=file]').get(0);
    $.when(function() {
      var deferred = $.Deferred();
      if (file.files.length > 0) {
        return Playlists.process(file.files[0]);
      } else if (name != '') {
        if (oldName) {
          $.when(Playlists.rename(oldName, name)
          ).then(function() {
            deferred.resolve({name: name});
          });
          return deferred.promise();
        } else {
          return Playlists.add(name);
        }
      } else {
        deferred.resolve();
        return deferred.promise();
      }
    }()).then(function(result) {
      $('#newPlaylistModal').modal('hide');
      if (result && result.error) {
        $scope.msg(result.error);
      } else {
        // for some fucking reason in this case I gotta wait a bit for the
        // indices to update
        setTimeout(function() {
          $scope.$apply(function() {
            $scope.loadPlaylists();
            if (result && result.name) {
              $scope.msg('Playlist "' + result.name + '" has been imported');
              $location.path('/playlists/' + encodeURIComponent(result.name));
            }
          });
        }, 100);
      }
    });
  };

  $scope.cancel = function() {
    $('#newPlaylistModal').modal('hide');
  };

}]);

