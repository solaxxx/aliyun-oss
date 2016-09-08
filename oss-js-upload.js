'use strict';
(function () {

  var detectIEVersion = function () {
    var v = 4,
        div = document.createElement('div'),
        all = div.getElementsByTagName('i');
    while (
        div.innerHTML = '<!--[if gt IE ' + v + ']><i></i><![endif]-->',
            all[0]
        ) {
      v++;
    }
    return v > 4 ? v : false;
  };

  var _extend = function (dst, src) {
    for (var i in src) {
      if (Object.prototype.hasOwnProperty.call(src, i) && src[i]) {
        dst[i] = src[i];
      }
    }
  };

  // 控制oss的上传
  function OssUploadCtrl (options) {
    this.options = options;
    this._reqList = [];
  }

  /**
   * [abort description]
   * @return {[type]} [description]
   */
  OssUploadCtrl.prototype.abort = function () {
    if (this.isComplete()) return; // 如果已经完成，则不能再调用abort
    if (this.isSingle()) {
      this.abortSingle();
    } else if (this.isMulti()) {
      this.abortMulti();
    } else {
      var onabort = this.options.uploadOptions.onabort;
      if (typeof onabort === 'function') {
        this.options.uploadOptions.onabort();
      }
    }
    this.setAsAbort();
  }

  // 标记为已经中断上传了，可以根据这个特性做更多细粒度的中断控制
  OssUploadCtrl.prototype.setAsAbort = function () {
    this._isAbort = true;
  }

  // 判断是否已经中断
  OssUploadCtrl.prototype.isAbort = function () {
    return !!this._isAbort;
  }

  // 终端单片数据上传
  OssUploadCtrl.prototype.abortSingle = function () {
    this.abortReqList(); // 中断上传
    var onabort = this.options.uploadOptions.onabort;
    if (typeof onabort === 'function') {
      this.options.uploadOptions.onabort();
    }
  }

  // 中断多片数据上传
  OssUploadCtrl.prototype.abortMulti = function () {
    this.abortReqList();
    if (this._uploadId) {
      var oss = this.options.oss;
      oss.abortMultipartUpload({
        Bucket: this.options.Bucket,
        Key: this.options.Key,
        UploadId: this._uploadId
      }, (function (err, reqId) {
      }).bind(this));
    }
    var onabort = this.options.uploadOptions.onabort;
    if (typeof onabort === 'function') {
      this.options.uploadOptions.onabort(this._uploadId);
    }
  }

  // 针对只上传一个文件片的，保存req对象
  OssUploadCtrl.prototype.setReq = function (req) {
    this._req = req;
  }
  // 针对上传多个文件片的，保存上传uploadId
  OssUploadCtrl.prototype.setUploadId = function (uploadId) {
    this._uploadId = uploadId;
  }

  // 保存模式，single, multi
  OssUploadCtrl.prototype.setType = function (type) {
    this._type = type;
  }

  // 获取模式
  OssUploadCtrl.prototype.getType = function (type) {
    return this._type;
  }

  // 设置为上传单片模式
  OssUploadCtrl.prototype.setAsSingle = function () {
    this.setType('single');
  }

  // 设置为上传多片模式
  OssUploadCtrl.prototype.setAsMulti = function () {
    this.setType('multi');
  }

  // 标记为完成状态
  OssUploadCtrl.prototype.setAsComplete = function () {
    this._isComplete = true;
  }

  OssUploadCtrl.prototype.isComplete = function () {
    return !!this._isComplete;
  }

  OssUploadCtrl.prototype.isMulti = function () {
    return this.getType() === 'multi';
  }

  OssUploadCtrl.prototype.isSingle = function () {
    return this.getType() === 'single';
  }

  // 把上传过程中创造的req对象保存起来，在abort的时候，把这些req都abort了，并清空
  OssUploadCtrl.prototype.addReqList = function (req) {
    this._reqList.push(req);
  }

  // 中断所有req
  OssUploadCtrl.prototype.abortReqList = function () {
    this._reqList.forEach((function (req) {
      req.abort();
    }).bind(this));
    this._reqList = [];
  }

  function OssUpload(config) {
    if (!config) {
      // console.log('需要 config');
      return;
    }
    this._config = {
      chunkSize: 1048576    // 1MB
    };

    if (this._config.chunkSize && this._config.chunkSize < 102400) {
      // console.log('chunkSize 不能小于 100KB');
      return;
    }

    _extend(this._config, config);

    if (!this._config.aliyunCredential && !this._config.stsToken) {
      // console.log('需要 stsToken');
      return;
    }

    if (!this._config.endpoint) {
      // console.log('需要 endpoint');
      return;
    }

    var ALY = window.ALY;
    if (this._config.stsToken) {
      this.oss = new ALY.OSS({
        accessKeyId: this._config.stsToken.Credentials.AccessKeyId,
        secretAccessKey: this._config.stsToken.Credentials.AccessKeySecret,
        securityToken: this._config.stsToken.Credentials.SecurityToken,
        endpoint: this._config.endpoint,
        apiVersion: '2013-10-15'
      });
    }
    else {
      this.oss = new ALY.OSS({
        accessKeyId: this._config.aliyunCredential.accessKeyId,
        secretAccessKey: this._config.aliyunCredential.secretAccessKey,
        endpoint: this._config.endpoint,
        apiVersion: '2013-10-15'
      });
    }

    var arr = this._config.endpoint.split('://');
    if (arr.length < 2) {
      // console.log('endpoint 格式错误');
      return;
    }
    this._config.endpoint = {
      protocol: arr[0],
      host: arr[1]
    }

  }

  OssUpload.prototype.upload = function (options) {
    if (!options) {
      if (typeof options.onerror == 'function') {
        options.onerror('需要 options');
      }
      return;
    }

    if (!options.file && !options.base64) {
      if (typeof options.onerror == 'function') {
        options.onerror('需要 file');
      }
      return;
    }
    var file = options.file;

    if (!options.key) {
      if (typeof options.onerror == 'function') {
        options.onerror('需要 key');
      }
      return;
    }
    // 去掉 key 开头的 /
    options.key = options.key.replace(new RegExp("^\/"), '');

    var self = this;
    var ossUploadCtrl = new OssUploadCtrl({
      oss: this.oss,
      Bucket: self._config.bucket,
      Key: options.key,
      uploadOptions: options
    });

    var readFile = function (callback) {
      var result = {
        chunksHash: {},
        chunks: []
      };
      var blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice;
      var chunkSize = self._config.chunkSize;
      var chunksNum = Math.ceil(file.size / chunkSize);
      var currentChunk = 0;

      var frOnload = function (e) {
        result.chunks[currentChunk] = e.target.result;
        currentChunk++;
        if (currentChunk < chunksNum) {
          loadNext();
        }
        else {
          result.size = file.size;
          result.type = file.type;
          callback(null, result);
        }
      };
      var frOnerror = function () {
        console.error("读取文件失败");
        if (typeof options.onerror == 'function') {
          options.onerror("读取文件失败");
        }
      };

      function loadNext() {
        var fileReader = new FileReader();
        fileReader.onload = frOnload;
        fileReader.onerror = frOnerror;

        var start = currentChunk * chunkSize,
            end = ((start + chunkSize) >= file.size) ? file.size : start + chunkSize;
        var blobPacket = blobSlice.call(file, start, end);
        fileReader.readAsArrayBuffer(blobPacket);
      }

      loadNext();
    };

    // 把base64字符串转换成ArrayBuffer格式数据
    var base64ToArrayBuffer = function (_base64, callback) {
      var result = {
        chunks: []
      };
      var base64 = _base64.split(',')[1];
      var base64Info = _base64.split(',')[0];
      var type = base64Info.split(';')[0].split(':')[1];
      if (!type) {
        if (typeof options.onerror == 'function') {
          options.onerror('无法获取该base64的文件类型');
        }
      }
      var binary_string;
      try {
        binary_string =  window.atob(base64);
      } catch (e) {
        if (typeof options.onerror == 'function') {
          options.onerror('无法正常转换该base64字符串为二进制');
        }
      }

      var len = binary_string.length;
      var bytes = new Uint8Array( len );
      for (var i = 0; i < len; i++)        {
          bytes[i] = binary_string.charCodeAt(i);
      }
      bytes = bytes.buffer;
      var chunkSize = self._config.chunkSize;
      var chunksNum = Math.ceil(len / chunkSize);
      var currentChunk = 0;
      for (var k = 0; k < chunksNum; k ++) {
        result.chunks.push(bytes.slice(k * chunkSize, k * chunkSize + chunkSize - 1));
      }
      result.size = bytes.byteLength;
      result.type = type;
      if (callback) callback (null, result);
    }

    var uploadSingle = function (result, callback) {
      if (ossUploadCtrl.isAbort()) return; // 如果已经中断，就不上传了
      ossUploadCtrl.setAsSingle(); // 标记为单片上传
      var params = {
        Bucket: self._config.bucket,
        Key: options.key,
        Body: result.chunks[0],
        ContentType: result.type || ''
      };
      _extend(params, options.headers);

      var req = self.oss.putObject(params, callback);
      ossUploadCtrl.addReqList(req); // 添加req

      req.on('httpUploadProgress', function(p) {
        if (typeof options.onprogress == 'function') {
          options.onprogress({
            loaded: p.loaded,
            total: result.size
          });
        }
      });
    };

    var uploadMultipart = function (result, callback) {
      if (ossUploadCtrl.isAbort()) return; // 如果已经中断，就不上传了
      ossUploadCtrl.setAsMulti(); // 标记为多片上传
      var maxUploadTries = options.maxRetry || 3;
      var uploadId;
      var loadedNum = 0;
      var latestUploadNum = -1;
      var concurrency = 0;

      var multipartMap = {
        Parts: []
      };

      var init = function () {
        var params = {
          Bucket: self._config.bucket,
          Key: options.key,
          ContentType: result.type || ''
        };
        _extend(params, options.headers);

        self.oss.createMultipartUpload(params,
            function (mpErr, res) {
              if (ossUploadCtrl.isAbort()) return; // 如果已经中断，就不上传了

              if (mpErr) {
                // console.log('Error!', mpErr);
                callback(mpErr);
                return;
              }

              // console.log("Got upload ID", res.UploadId);
              uploadId = res.UploadId;
              ossUploadCtrl.setUploadId(uploadId); // 保存uploadId
              uploadPart(0);
            });
      };

      var uploadPart = function (partNum) {
        if(partNum >= result.chunks.length) {
          return;
        }

        concurrency++;
        if(latestUploadNum < partNum) {
          latestUploadNum = partNum;
        }
        if(concurrency < self._config.concurrency && (partNum < (result.chunks.length - 1))) {
          uploadPart(partNum + 1);
        }
        var partParams = {
          Body: result.chunks[partNum],
          Bucket: self._config.bucket,
          Key: options.key,
          PartNumber: String(partNum + 1),
          UploadId: uploadId
        };

        var tryNum = 1;

        var doUpload = function () {

          multipartMap.Parts[partNum] = {
            PartNumber: partNum + 1,
            loaded: 0
          };

          if (ossUploadCtrl.isAbort()) return; // 如果已经中断，就不上传了

          var req = self.oss.uploadPart(partParams, function (multiErr, mData) {
            if (multiErr) {
              // console.log('multiErr, upload part error:', multiErr);
              if (tryNum > maxUploadTries) {
                console.log('上传分片失败: #', partParams.PartNumber);
                callback(multiErr);
              }
              else {
                console.log('重新上传分片: #', partParams.PartNumber);
                multipartMap.Parts[partNum].loaded = 0;
                tryNum++;
                doUpload();
              }
              return;
            }

            multipartMap.Parts[partNum].ETag = mData.ETag;
            multipartMap.Parts[partNum].loaded = partParams.Body.byteLength;

            // console.log(mData);
            concurrency--;

            console.log("Completed part", partNum + 1);
             //console.log('mData', mData);

            loadedNum++;
            if (loadedNum == result.chunks.length) {
              complete();
            }
            else {
              uploadPart(latestUploadNum + 1);
            }
          });
          ossUploadCtrl.addReqList(req); // 添加req

          req.on('httpUploadProgress', function(p) {
            multipartMap.Parts[partNum].loaded = p.loaded;

            var loaded = 0;
            for(var i in multipartMap.Parts) {
              loaded += multipartMap.Parts[i].loaded;
            }

            if (typeof options.onprogress == 'function') {
              options.onprogress({
                loaded: loaded,
                total: result.size
              });
            }
          });
        };

        doUpload();

      };

      var complete = function () {
        // console.log("Completing upload...");

        for(var i in multipartMap.Parts) {
          delete multipartMap.Parts[i].loaded;
        }

        var doneParams = {
          Bucket: self._config.bucket,
          Key: options.key,
          CompleteMultipartUpload: multipartMap,
          UploadId: uploadId
        };

        self.oss.completeMultipartUpload(doneParams, callback);
      };

      init();
    };

    if (options.base64) {
      base64ToArrayBuffer(options.base64, function (err, result) {
        var callback = function (err, res) {
          if (err) {
            if (typeof options.onerror == 'function') {
              options.onerror(err);
            }
            return;
          }

          if (typeof options.oncomplete == 'function') {
            ossUploadCtrl.setAsComplete();
            options.oncomplete(res);
          }
        };

        if (result.chunks.length == 1) {
          uploadSingle(result, callback)
        }
        else {
          uploadMultipart(result, callback);
        }
      });
    }

    if (options.file) {
      readFile(function (err, result) {
        var callback = function (err, res) {
          if (err) {
            if (typeof options.onerror == 'function') {
              options.onerror(err);
            }
            return;
          }

          if (typeof options.oncomplete == 'function') {
            ossUploadCtrl.setAsComplete();
            options.oncomplete(res);
          }
        };

        if (result.chunks.length == 1) {
          uploadSingle(result, callback)
        }
        else {
          uploadMultipart(result, callback);
        }
      });
    }

    return ossUploadCtrl; // 返回一个oss上传控制对象
  };

  window.OssUpload = OssUpload;

})();
