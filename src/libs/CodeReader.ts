// CodeReader.ts --- コードリーダー(QRコードなどを読み込む)
// Author: katahiromz
// License: MIT

import { readBarcodesFromImageData, type ReaderOptions } from 'zxing-wasm/reader';

export interface QRResult {
  data: string;
  location: {
    points: { x: number, y: number }[] // 座標を配列で保持
  };
}

// 読み取るコードの形式
const CODE_FORMATS = ['QRCode', 'MicroQRCode', 'rMQRCode', 'EAN-13'];

export class CodeReader {
  // WASMをウォームアップさせる静的メソッド
  // 内部でダミーデータを読み込み、ランタイムを初期化します。
  static async warmup(): Promise<void> {
    try {
      const dummyData = new ImageData(1, 1);
      // zxing-wasmの初期化を促す
      await readBarcodesFromImageData(dummyData, { formats: CODE_FORMATS });
      console.log('zxing-wasm warmed up');
    } catch (e) {
      // 初回ロード時は内部的に例外を投げる可能性があるため、ログ出力に留める
      console.warn('zxing-wasm warmup notice:', e);
    }
  }

  // @zxing/library の頂点の配置が不格好なので、正方形になるよう補正
  static fixPoints(p0: { x: number, y: number }[]): { x: number, y: number }[] {
    // まずは元のロジックで4点目を計算
    const points = [p0[0], p0[1], p0[2]];
    let dx0 = p0[1].x - p0[0].x, dy0 = p0[1].y - p0[0].y;
    let dx1 = p0[2].x - p0[0].x, dy1 = p0[2].y - p0[0].y;
    points.push({ x: p0[0].x - dx0 + dx1, y: p0[0].y - dy0 + dy1 });
    // 重心を求める
    const cx = (points[0].x + points[1].x + points[2].x + points[3].x) / 4;
    const cy = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;
    // 各頂点を中心から遠ざける
    const scale = 1.07;
    return points.map(p => ({
      x: cx + (p.x - cx) * scale,
      y: cy + (p.y - cy) * scale
    }));
  }

  // 複数のQRコードの検出が可能
  static async scanMultiple(canvas: HTMLCanvasElement): Promise<QRResult[]> {
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      // ImageDataを取得
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // zxing-wasmでバーコードを読み取る
      const results = await readBarcodesFromImageData(imageData, {
        formats: CODE_FORMATS,
        tryHarder: false,
        maxNumberOfSymbols: 8,
      });

      // 結果を変換
      return results.map(result => {
        // zxing-wasmの座標を取得
        const position = result.position;
        const points = [
          { x: position.topLeft.x, y: position.topLeft.y },
          { x: position.topRight.x, y: position.topRight.y },
          { x: position.bottomRight.x, y: position.bottomRight.y },
          { x: position.bottomLeft.x, y: position.bottomLeft.y }
        ];

        let fixedPoints = CodeReader.fixPoints(points);

        return {
          data: result.text,
          location: {
            points: fixedPoints
          }
        };
      });
    } catch (e) {
      console.log('Scan error:', e);
      return [];
    }
  }

  // 枠(ボックス)を描画する
  static drawQRBox(ctx: CanvasRenderingContext2D, result: QRResult, size: number) {
    if (!result || !result.location || !result.location.points || result.location.points.length < 4) {
      return;
    }
    const points = result.location.points;
    ctx.save();

    // 1. 枠線の描画
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#009900"; // 緑色
    ctx.stroke();

    // 2. テキストの描画設定
    let fontSize = size * 0.03;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = "#009900";

    // 3. 傾きと位置の計算
    // 上辺のベクトル (p0 -> p1)
    const dx = points[1].x - points[0].x;
    const dy = points[1].y - points[0].y;
    const angle = Math.atan2(dy, dx); // 角度(ラジアン)
    const topWidth = Math.sqrt(dx * dx + dy * dy); // 上辺の長さ

    // 4. テキストの省略処理
    let data = result.data;
    let measure = ctx.measureText(data);
    const maxWidth = topWidth * 1.4;

    if (measure.width > maxWidth) {
      while (data.length > 0 && ctx.measureText(data + '...').width > maxWidth) {
        data = data.substring(0, data.length - 1);
      }
      data += '...';
      measure = ctx.measureText(data);
    }

    // 5. 座標系を回転させてテキストを描画
    // テキストの配置位置：上辺の中央 (p0とp1の中点)
    const centerX = (points[0].x + points[1].x) / 2;
    const centerY = (points[0].y + points[1].y) / 2;

    ctx.translate(centerX, centerY); // 原点を上辺中央に移動
    ctx.rotate(angle);               // QRコードの傾きに合わせて回転

    // 描画 (y方向のマイナスは枠線の少し上に表示するため)
    // textAlignをcenterにすることで計算を簡略化
    ctx.textAlign = "center";
    ctx.fillText(data, 0, -ctx.lineWidth);

    ctx.restore();
  }

  // 複数のQRボックスを一度に描画する
  static drawAllBoxes(ctx: CanvasRenderingContext2D, results: QRResult[], size: number) {
    results.forEach(res => this.drawQRBox(ctx, res, size));
  }

  // 文字列からURLをすべて抽出して配列で返す
  static extractUrls(text: string): string[] {
    // URLにマッチする正規表現
    const urlPattern = /https?:\/\/[\w/:%#\$&\?\(\)~\.=\+\-]+/g;
    // マッチするものがない場合は空の配列を返す
    return text.match(urlPattern) || [];
  }
}