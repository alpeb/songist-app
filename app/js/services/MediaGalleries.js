songist.factory('MediaGalleries', ['Genres', 'Artists', 'Albums', 'Tracks', 'Queue', function(Genres, Artists, Albums, Tracks, Queue) {
  var formats = ['m4a', 'ogg', 'mp3', 'wav'];
  var gGalleryArray = [];    // holds information about all top-level Galleries found - list of DomFileSystem
  var gDirectories = [];     // used to process subdirectories
  var files = [];
  var gGalleryIndex = 0;     // gallery currently being iterated
  var scanId;
  var gGalleryReader = null; // the filesytem reader for the current gallery
  var entries;
  var entryIndex;
  var isNewDb;
  var parensGenreRe = /^(\(\d+\))+(.*)$/;
  var onlyParensGenreRe = /^\((\d+)\)$/;
  var onlyNumber = /^\d+$/;
  var scanDeferred;

  var getInfo = function(results) {
     //console.log("galleries: ", results);
     if (results.length) {
        gGalleryArray = results; // store the list of gallery directories
        gGalleryIndex = 0;
     }
  };

  var sevenBitPadder = function(str) {
    while (str.length < 7) {
      str = "0" + str;
    }
    return str;
  };

  var removeNils = function(str) {
    return str.replace (/\u0000/g, "");
  }

  var getUint24 = function(dv, offset) {
    var b2 = dv.getUint8(offset);
    var b1 = dv.getUint8(offset + 1);
    var b0 = dv.getUint8(offset + 2);
    return (b2 << 16) + (b1 << 8) + b0; 
  };

  /**
   * Based on https://github.com/aadsm/JavaScript-ID3-Reader
   */
  var types = {
    '0'     : 'uint8',
    '1'     : 'text',
    '13'    : 'jpeg',
    '14'    : 'png',
    '21'    : 'uint8'
  };

  var atoms = {
    '©alb': ['album'],
    '©art': ['artist'],
    '©ART': ['artist'],
    'aART': ['artist'],
    '©day': ['year'],
    '©nam': ['title'],
    '©gen': ['genre'],
    'trkn': ['track'],
    'covr': ['picture'],
    '©gen': ['genre']
  };

  var readAtom = function(tag, dv, offset, length, indent) {
    indent = indent === undefined ? "" : indent + "  ";
    var seek = offset;
    while (seek < offset + length) {
      var atomSize = dv.getUint32(seek);
      if (atomSize == 0) return;
      var atomName = dv.getString(4, seek + 4);
      // Container atoms
      if (['moov', 'udta', 'meta', 'ilst'].indexOf(atomName) > -1) {
        if (atomName == 'meta') seek += 4; // next_item_id (uint32)
        readAtom(tag, dv, seek + 8, atomSize - 8, indent);
        return;
      }
      // Value atoms
      if (atoms[atomName]) {
        var klass = getUint24(dv, seek + 16 + 1);
        var atom = atoms[atomName];
        var type = types[klass];
        if (atomName == 'trkn') {
          tag[atom[0]] = dv.getUint8(seek + 16 + 11);
          tag['count'] = dv.getUint8(seek + 16 + 13);
        } else {
          // 16: name + size + "data" + size (4 bytes each)
          // 4: atom version (1 byte) + atom flags (3 bytes)
          // 4: NULL (usually locale indicator)
          var dataStart = seek + 16 + 4 + 4;
          var dataEnd = atomSize - 16 - 4 - 4;
          switch( type ) {
            case 'text': 
              tag[atom[0]] = dv.getString(dataEnd, dataStart, 'utf8');
              break;
            case 'uint8':
              tag[atom[0]] = dv.getUint8(dataStart);
              break;
            /*case 'jpeg':
            case 'png':
              tag[atom[0]] = {
              format  : "image/" + type,
              data    : dv.getBytesAt(dataStart, dataEnd)
              };
              break;*/
          }
        }
      }
      seek += atomSize;
    }
  };

  var errorPrintFactory = function(custom) {
    return function(e) {
      var msg = '';
      switch (e.code) {
        case FileError.QUOTA_EXCEEDED_ERR:
          msg = 'QUOTA_EXCEEDED_ERR';
          break;
        case FileError.NOT_FOUND_ERR:
          msg = 'NOT_FOUND_ERR';
          break;
        case FileError.SECURITY_ERR:
          msg = 'SECURITY_ERR';
          break;
        case FileError.INVALID_MODIFICATION_ERR:
          msg = 'INVALID_MODIFICATION_ERR';
          break;
        case FileError.INVALID_STATE_ERR:
          msg = 'INVALID_STATE_ERR';
          break;
        default:
          msg = 'Unknown Error';
          break;
      };

      console.log(custom + ': ' + msg);
    };
  };

  var scanGallery = function(currentEntries) {
    entries = currentEntries;
    // when the size of the entries array is 0, we've processed all the directory contents
    if (entries.length == 0) {
      if (gDirectories.length > 0) {
        var dir_entry = gDirectories.shift();
        console.log('Directory: ' + dir_entry.fullPath);
        gGalleryReader = dir_entry.createReader();
        gGalleryReader.readEntries(scanGallery, errorPrintFactory('scanGallery()'));
      } else {
        gGalleryIndex++;
        if (gGalleryIndex < gGalleryArray.length) {
          scanGalleries(gGalleryArray[gGalleryIndex]);
        } else {
          $.when(Tracks.resetCaches()).then(processFiles);
        }
      }
      return;
    }

    entryIndex = 0;
    processEntries();
  };

  var scanGalleries = function(fs) {
     var mData = chrome.mediaGalleries.getMediaFileSystemMetadata(fs);
     console.log('Gallery: ' + mData.name);
     gGalleryReader = fs.root.createReader();
     gGalleryReader.readEntries(scanGallery, errorPrintFactory('scanGalleries()'));
  };

  var processFiles = function() {
    console.log("Processing files");
    $('#processingModal').modal('hide');
    $('#rightContainer').show();
    $('#progressWrapper .bar').css('width', '0%');
    $('#progressWrapper').show();
    var itemEntry, mData, ext;
    var trackReader = new FileReader();
    var artReader = new FileReader();
    var numFiles = files.length;
    var processedFiles = 0;

    // gotta use this pattern cuz for some reason I can't pass the entire files array to a worker,
    // and passing one by one causes a memleak for some reason
    var iterateFiles = function() {
      itemEntry = files.shift();
      //console.log("Processing:", itemEntry);
      mData = chrome.mediaGalleries.getMediaFileSystemMetadata(itemEntry.filesystem);
      ext = itemEntry.name.substr(itemEntry.name.lastIndexOf('.') + 1).toLowerCase();
      itemEntry.file(function(file) {
        var size = file.size;

        if ($.inArray(ext, formats) == -1 || size <= 128 || size >= 15728640) {
          console.log("Skipping file " + file.name + " (format not supported or file is too big)");
          if (files.length > 0) {
            setTimeout(iterateFiles, 15);
          } else {
            finishProcessFiles();
          }
        } else if (size > 128 && size < 15728640) {
          // only process files smaller than 15 MB 'cause big files can kill the browser
          trackReader.onloadend = function(e) {
            // this happened to me when using the iTunes location
            if (!this.result) {
              console.log("Error: file couldn't be read");
              if (files.length > 0) {
                setTimeout(iterateFiles, 15);
              } else {
                finishProcessFiles();
              }
              return;
            }

            var frameId, frameSize, offsetFrame;
            var title = artist = album = year = comment = genre = artMimeType = '';
            var letter;
            var trackNumber = 0;
            var artSize = 0;
            var art = null;
            var artBlob = null;

            var dv = new jDataView(this.result);
            if (ext == "mp3") {
              var FLAG_EXTENDED_HEADER = 0x40;
              // http://www.id3.org/id3v2.3.0
              if (dv.getString(3) == 'ID3') {
                //console.log("ID3V2");
                var version = dv.getUint8(3);
                var flags = dv.getString(1, 3);
                var sizeB1 = sevenBitPadder(dv.getUint8(6).toString(2));
                var sizeB2 = sevenBitPadder(dv.getUint8(7).toString(2));
                var sizeB3 = sevenBitPadder(dv.getUint8(8).toString(2));
                var sizeB4 = sevenBitPadder(dv.getUint8(9).toString(2));
                var tagSize = parseInt(sizeB1 + sizeB2 + sizeB3 + sizeB4, 2) + 10;
                var offset = 10;
                var encoding;
                var bom;
                var strLength;
                if (version == 2) {
                  //console.log("ID3V2.2");
                  while (offset < tagSize) {
                    if (title && artist && album && trackNumber && year && genre) {
                      break;
                    }
                    frameId = dv.getString(3, offset);
                    frameSize = getUint24(dv, offset + 3);
                    offsetFrame = offset + 6;
                    switch (frameId) {
                      case 'TT2':
                        title = removeNils(dv.getString(frameSize, offsetFrame).trim());
                        break;
                      case 'TP1':
                        artist = removeNils(dv.getString(frameSize, offsetFrame).trim());
                        break;
                      case 'TAL':
                        album = removeNils(dv.getString(frameSize, offsetFrame).trim());
                        break;
                      case 'TRK':
                        trackNumber = removeNils(dv.getString(frameSize, offsetFrame).trim());
                        trackExtra = trackNumber.lastIndexOf("/");
                        if (trackExtra > -1) {
                          trackNumber = trackNumber.substring(0, trackExtra);
                        }
                        break;
                      case 'TYE':
                        year = removeNils(dv.getString(frameSize, offsetFrame).trim());
                        break;
                      case 'TCO':
                        genre = removeNils(dv.getString(frameSize, offsetFrame).trim());
                        genre = processGenre(genre);
                        break;
                    }
                    offset += frameSize + 6;
                  }
                } else {
                  //console.log("ID3V2.3"); // the most common
                  if (!(flags & FLAG_EXTENDED_HEADER)) {
                    while (offset < tagSize) {
                      if (title && album && artist && year && genre && trackNumber && artSize) {
                        break;
                      }
                      frameId = dv.getString(4, offset);
                      frameSize = dv.getUint32(offset + 4);
                      if (frameSize > 0) {
                        encoding = dv.getUint8(offset + 10);
                        bom = dv.getUint16(offset + 11);
                        if (encoding == 1 && bom == 65534) {
                          offsetFrame = offset + 13;
                          strLength = frameSize - 3;
                        } else {
                          offsetFrame = offset + 11;
                          strLength = frameSize - 1;
                        }
                        switch (frameId) {
                          case 'TALB':
                            album = removeNils(dv.getString(strLength, offsetFrame).trim());
                            break;
                          case 'TIT2':
                            title = removeNils(dv.getString(strLength, offsetFrame).trim());
                            break;
                          case 'TPE1':
                            artist = removeNils(dv.getString(strLength, offsetFrame).trim());
                            break;
                          case 'TRCK':
                            trackNumber = removeNils(dv.getString(strLength, offsetFrame).trim());
                            break;
                          case 'TYER':
                            year = removeNils(dv.getString(strLength, offsetFrame).trim());
                            break;
                          case 'TCON':
                            genre = removeNils(dv.getString(strLength, offsetFrame).trim());
                            genre = processGenre(genre);
                            break;
                          case 'APIC':
                            if (artSize) {
                              // only care about the first pic
                              break;
                            }
                            while (true) {
                              letter = dv.getUint8(offsetFrame++);
                              if (letter == 0) {
                                break;
                              }
                              artMimeType += String.fromCharCode(letter > 127 ? 65533 : letter);
                            }
                            offsetFrame++; // picture type

                            // picture description
                            while (true) {
                              letter = dv.getUint8(offsetFrame++);
                              if (letter == 0) {
                                break;
                              }
                            }

                            artBlob = file.slice(offsetFrame, offset + 10 + frameSize, 'image/png');
                            artSize = offset + 10 + frameSize - offsetFrame;
                            break;
                        }
                      }
                      offset += frameSize + 10;
                    }
                  }
                }
              } else {
                if (dv.getString(3, size - 128) == 'TAG') {
                  //console.log("ID3V1");
                  title = removeNils(dv.getString(30).trim());
                  artist = removeNils(dv.getString(30).trim());
                  album = removeNils(dv.getString(30).trim());
                  year = dv.getString(4);
                  comment = dv.getString(28);

                  var zeroByte = dv.getUint8();
                  var postZeroByte = dv.getUint8();
                  if (zeroByte == 0) {
                    trackNumber = postZeroByte;
                  }

                  genre = processGenre(dv.getUint8());
                }
              }
            } else if (ext == 'm4a') {
              //console.log("m4a");
              var tag = {};
              readAtom(tag, dv, 0, size);
              title = tag.title || '';
              artist = tag.artist || '';
              album = tag.album || '';
              year = tag.year || '';
              trackNumber = tag.track || 0;
              genre = tag.genre || '';
            }

            dv = null;

            if (!title) {
              title = file.name.substring(0, file.name.lastIndexOf('.'));
            }

            $.when(function() {
              var deferred = $.Deferred();
              if (!artBlob) {
                deferred.resolve();
              } else {
                artReader.onloadend = function() {
                  art = this.result;

                  // invalid data
                  if (art == 'data:') {
                    console.log("discarded bad art for " + itemEntry.fullPath);
                    art = null;
                  }

                  deferred.resolve();
                }
                artReader.readAsDataURL(artBlob);
              }
              return deferred.promise();
            }()).then(function() {
              var track = {
                title: title,
                artist: artist.trim().toLowerCase(),
                album: album.trim().toLowerCase(),
                genre: genre.trim().toLowerCase(),
                art: art,
                filename: itemEntry.name,
                path: itemEntry.fullPath,
                scanId: scanId,
                gallery: mData.name
              };

              $.when(Tracks.add(track, {
                artist: artist.trim(),
                album: album.trim(),
                genre: genre.trim()
              })).then(function() {
                //console.log("Track: " + track.title);
                Queue.push(track);
                if (files.length > 0) {
                  setTimeout(iterateFiles, 15);
                } else {
                  finishProcessFiles();
                }
              });
            });
          };

          trackReader.readAsArrayBuffer(file);
        }

        scanDeferred.notify(Math.floor(processedFiles++ / numFiles * 100));
      }, function(name) {
        return function(err) {
          console.log("Error: could not process file: " + name);
          if (files.length > 0) {
            setTimeout(iterateFiles, 15);
          } else {
            finishProcessFiles();
          }
        }
      }(itemEntry.name));
    };

    if (files.length > 0) {
      setTimeout(iterateFiles, 15);
    } else {
      finishProcessFiles();
    }
   };

   var finishProcessFiles = function() {
     console.log("Done processing files");
     if (!isNewDb) {
       var mData;
       var arrGalleryNames = [];
       $.each(gGalleryArray, function(index, value) {
         mData = chrome.mediaGalleries.getMediaFileSystemMetadata(value);
         arrGalleryNames.push(mData.name);
       });

       $.when(Tracks.deleteFiles(arrGalleryNames, scanId))
          .then(Genres.updateAll)
          .then(Artists.updateAll)
          .then(Albums.updateAll)
          .then(scanDeferred.resolve);
     } else {
       $.when(Genres.updateAll()).then(scanDeferred.resolve);
     }
   };

  var processEntries = function() {
    var entry = entries[entryIndex];
    if (entry) {
      var deferred = $.Deferred();
      if (entry.isFile) {
        if (isNewDb) {
          files.push(entry);
          deferred.resolve();
        } else {
          $.when(Tracks.isNew(entry, scanId)).then(function(newEntry) {
            if (newEntry) {
              files.push(newEntry);
            }
            deferred.resolve();
          });
        }
      } else if (entry.isDirectory) {
        gDirectories.push(entry);
        deferred.resolve();
      }

      entryIndex++;
      $.when(deferred.promise()).then(function() {
        setTimeout(processEntries);
      });
    } else {
      // readEntries has to be called until it returns an empty array. According to the spec,
      // the function might not return all of the directory's contents during a given call.
      gGalleryReader.readEntries(scanGallery, errorPrintFactory('scanGallery()2'));
    }
  };

  var processGenre = function(genre) {
    if (!genre) {
      return '';
    }

    if (parseInt(genre)) {
      if (genre > 125) {
        genre = '';
      } else {
        genre = genres[genre];
      }
    } else {
      var matches;

      // only keep refinements
      matches = genre.match(parensGenreRe);
      if (matches) {
        genre = matches.pop();
      }

      // remove parens (e.g. Welcome to the Jungle)
      matches = genre.match(onlyParensGenreRe);
      if (matches) {
        genre = matches.pop();
      }

      matches = genre.match(onlyNumber);
      if (matches) {
        genre = genres[matches.pop()];
      }
    }

    return genre;
  };

  return {
    scan: function(newDb) {
      scanDeferred = $.Deferred();
      isNewDb = newDb;
      chrome.mediaGalleries.getMediaFileSystems({
         interactive : 'if_needed'
      }, function(results) {
        getInfo(results);
        if (gGalleryArray.length > 0) {
          scanId = Math.floor(new Date().valueOf() / 1000);
          scanGalleries(gGalleryArray[0]);
        }
      });
      return scanDeferred.promise();
    },

    select: function() {
      chrome.mediaGalleries.getMediaFileSystems({
         interactive : 'yes'
      }, function(results) {
        console.log("galleries: ", results);
        if (results.length) {
           gGalleryArray = results; // store the list of gallery directories
           gGalleryIndex = 0;
        }
      });
    },

    selectTrack: function(track) {
      var deferred = $.Deferred();
      // looks like I need to call this again before accessing
      // the file system
      chrome.mediaGalleries.getMediaFileSystems({
        interactive : 'if_needed'
      }, function(results) {
        getInfo(results);
        var fs = null;

        // get the filesystem that the selected file belongs to
        for (var i=0; i < gGalleryArray.length; i++) {
          var mData = chrome.mediaGalleries.getMediaFileSystemMetadata(gGalleryArray[i]);
          if (mData.name == track.gallery) {
            fs = gGalleryArray[i];
            break;
          }
        }

        if (fs) {
          fs.root.getFile(track.path, {create: false}, function(fileEntry) {
            var url = fileEntry.toURL();
            var newElem = null;

            fileEntry.file(function(fff) {
              var reader = new FileReader();
              reader.onerror = errorPrintFactory('FileReader');
              reader.onloadend = function(e) {
                deferred.resolve(this.result);
              };
              reader.readAsDataURL(fff);
            }, errorPrintFactory('PlayBack'));
          }, function(error) {
          console.log("ERROR: ", error);
          });
        }
      });

      return deferred.promise();
    }
  };
}]);
