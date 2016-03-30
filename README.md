# aliyun-oss
aliyun

## 直接上传base64文件

* 需要的base64文件格式是 data:fileType;base64,xxxxxxxxxxxxxxxxxxxx .其中fileType是文件类型

``` js
var ossUpload = new window.OssUpload({});

ossUpload.upload({
	base64: base64Str // 传一个base64参数，该参数必须是一个base64字符串
});

```
