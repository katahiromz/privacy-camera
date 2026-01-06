import fs from 'fs';
import path from 'path';

// コピー元とコピー先のパスを設定
const srcDir = path.resolve('dist');
const destDir = path.resolve('android/app/src/main/assets/camera');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// 1. 既存のコピー先を削除して、中身を空にする
if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true, force: true });
}

// 2. コピー先ディレクトリを作成
fs.mkdirSync(destDir, { recursive: true });

// 3. dist の中身をコピー
if (fs.existsSync(srcDir)) {
  copyRecursiveSync(srcDir, destDir);
  console.log('Successfully copied build files to Android assets!');
} else {
  console.error('Error: dist directory not found. Run "npm run build" first.');
}