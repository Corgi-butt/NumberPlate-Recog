/**
 * オブジェクトストレージへのアップロードと画像解析
 * storage-detect.js
 */

// 厳格モードにして、誤りを分かりやすくする
'use strict';

// ========================================

/**
 * 各種設定
 */

// API利用者識別用キー
const apiKey = 'AIzaSyB06BtL0e7rjcYnJgWXCX_aauLF1ZmDrf0';

// 利用するプロダクトを指定するDiscovery Documentの指定(複数指定可)
const discoveries = [
	// Cloud Storage
	'https://storage.googleapis.com/$discovery/rest?version=v1',

	// Vision
	'https://vision.googleapis.com/$discovery/rest?version=v1'
];

// アップロード先のCloud Storageのバケット
const uploadBucket = 'number_plate_system';

// ==================================================

/**
 * イベント発生時の処理
 */

// アップロードボタンクリック時の処理
function onButtonUploadClick(){
	console.log('アップロードボタンクリック時の処理');

	// ファイル情報の取得
	const file = inputUploadFile.files[0];

	// ファイルのアップロード
	uploadFileToGcs(uploadBucket, file)
	.then(response =>{
		console.log('ファイルのアップロードが完了したときの処理');
		console.log(response);

		// 処理結果の読み込み
		const data = response.result;

		// アップロード画像の表示場所にアップロードした画像を表示するimgタグを追加
		divImage.innerHTML = '<img src="' + data.mediaLink + '" width="100%">';

		// 認識結果を表示するテキストエリアを空に
		textDetectResult.value = '';

		// 画像解析APIを実行し、解析結果を処理するためのthenで処理できるようにreturn
		return gapi.client.vision.images.annotate({
			requests: [
				{
					image: {
						source: {gcsImageUri: "gs://" + data.bucket + "/" + data.name} // オブジェクトストレージ上の場所
					},
					features: [
						{type: "OBJECT_LOCALIZATION"} // 解析形式(画像内の複数物体を検出)
					]
				}
			]
		});
	})
	.then(response =>{
		console.log('画像解析が完了したときの処理');
		console.log(response);

		// 処理結果の読み込み
		const data = response.result.responses[0];

		// 画像表示エリアのスタイルをposition:relativeに変更
		// 赤枠用divの位置をdivImage基準にする
		divImage.style.position = 'relative';

		for(let i = 0; i < data.localizedObjectAnnotations.length; i++){
			// 認識された物体
			const label = data.localizedObjectAnnotations[i];

			// 認識結果を表示するテキストエリアに信頼度と物体名を追加
			textDetectResult.value += '[' + label.score*100 + '%] ' + label.name + "\r\n";

			// 人物の場合は赤枠で囲む
			if(label.name === 'License plate'){
				console.log(label);

				// 要素を囲む箱の位置が各四隅の点となっているので、
				// 上・左からの位置と幅・高さとなるようあらかじめ計算
				// (各四隅の点のx,y座標の位置は元の画像に対して相対的に(割合で)示されている)
				const boundingBoxPos = {
					// 上からの位置
					top: label.boundingPoly.normalizedVertices[0].y,

					// 左からの位置
					left: label.boundingPoly.normalizedVertices[0].x,

					// 幅
					width: (label.boundingPoly.normalizedVertices[2].x - label.boundingPoly.normalizedVertices[0].x),

					// 高さ
					height: (label.boundingPoly.normalizedVertices[2].y - label.boundingPoly.normalizedVertices[0].y),
				};

				console.log(boundingBoxPos);

				// 要素を囲む箱のスタイル
				let boundingBoxStyle = 'position:absolute;'; // 親要素からの絶対配置
				boundingBoxStyle += 'top:' + boundingBoxPos.top * 100 + '%;';
				boundingBoxStyle += 'left:' + boundingBoxPos.left * 100 + '%;';
				boundingBoxStyle += 'width:' + boundingBoxPos.width * 100 + '%;';
				boundingBoxStyle += 'height:' + boundingBoxPos.height * 100 + '%;';
				boundingBoxStyle += 'border:2px solid red;'; // 赤い枠
				boundingBoxStyle += 'border-radius:5px;'; // 枠の角を若干丸く

				// 画像の信頼度を表すラベル
				let boundingBoxLable = '<span style="background-color: rgb(255 255 255 / 60%);">'; // 若干透明に
				boundingBoxLable += label.score * 100 + '%';
				boundingBoxLable += '</span>';

				// 要素を囲む箱
				let boundingBox = '<div style="' + boundingBoxStyle + '">';
				boundingBox += boundingBoxLable
				boundingBox += '</div>';

				// 要素を囲む箱を画像エリアに追加
				divImage.innerHTML += boundingBox;
			}
		}
	});
}

// ==================================================

/**
 * HTMLパーツをJavaScriptで利用するための定義
 */

// ファイル選択
const inputUploadFile = document.getElementById('inputUploadFile');

// アップロードボタン
const buttonUpload = document.getElementById('buttonUpload');

// アップロード画像の表示場所
const divImage = document.getElementById('divImage');

// 認識結果の表示場所
const textDetectResult = document.getElementById('textDetectResult');


// ==================================================

/**
 * HTMLパーツのイベント発生時の処理を登録
 */

// アップロードボタンのクリック
buttonUpload.addEventListener('click', onButtonUploadClick);

// ==================================================

/**
 * GCP Client Libraryの初期設定
 */

gapi.load('client', () =>{
	gapi.client.init({
		'apiKey': apiKey, // APIキー
		'discoveryDocs': discoveries, // Discovery Documentの指定
	});
});

// ==================================================

/**
 * Cloud Storageへのアップロードに必要な関数
 */

// ファイルのアップロード(要buildMultipartDataForGcs関数)
async function uploadFileToGcs(bucket, file){
	// マルチパートデータの区切り文字列
	const boundary = '0123456789';

	// マルチパートデータの取得
	const multipartRequestBody = await buildMultipartDataForGcs(file, boundary)

	// APIによるアップロードを行い、その結果を返す
	return gapi.client.request({
		'path': '/upload/storage/v1/b/' + bucket + '/o', // アップロード先、バケットはURL内で指定
		'method': 'POST', // HTTPメソッドPOST
		'params': {
			'uploadType': 'multipart', // アップロード形式はマルチパート
			'predefinedAcl': 'publicRead' // アップロードした画像を認証無しで見られるようにする
		},
		'headers': {
			'Content-Type': 'multipart/mixed; boundary="' + boundary + '"' // マルチパートデータであることとその区切り文字列
		},
		'body': multipartRequestBody // リクエスト本文はマルチパートデータ
	});
}

// マルチパートデータの構築(要readAsBinaryString関数)
async function buildMultipartDataForGcs(file, boundary){
	// 各パートの区切り
	const delimiter = "--" + boundary + "\r\n";

	// 最後のパートの区切り
	const delimiterEnd = "--" + boundary + "--\r\n";

	// ファイル名等ファイルに関する情報の設定
	const metaData = {
		'name': file.name,
		'mimeType': file.type
	}

	// バイナリ文字列をBASE64文字列へ変換
	const base64Data = btoa(await readAsBinaryString(file));

	// マルチパートデータの構築
	return delimiter +
		"Content-Type: application/json\r\n" +
		"\r\n" +
		JSON.stringify(metaData) + "\r\n" +
		delimiter +
		"Content-Type: " + file.type + "\r\n" +
		"Content-Transfer-Encoding: base64\r\n" +
		"\r\n" +
		base64Data + "\r\n" +
		delimiterEnd;
}

// ファイルをバイナリ文字列として読み込み
function readAsBinaryString(file){
	// ファイル読み込みに使うFileReaderがPromise非対応のためPromise対応に
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => { resolve(reader.result); };
		reader.onerror = () => { reject(reader.error); };
		reader.readAsBinaryString(file);
	});
}
