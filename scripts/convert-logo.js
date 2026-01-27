const fs = require('fs');
const path = require('path');

// Since we don't have image processing libraries, we'll use a simple approach
// Copy the JPG and let Next.js handle it, or we can use sharp if available
// For now, let's just copy and rename - browsers can handle JPG as favicon

const sourcePath = path.join(__dirname, '../public/logo-new.jpg');
const destPath = path.join(__dirname, '../public/logo.png');

try {
  // Copy the file
  fs.copyFileSync(sourcePath, destPath);
  console.log('✅ Logo copied successfully');
  
  // Also copy to other icon files
  const iconFiles = [
    'icon-light-32x32.png',
    'icon-dark-32x32.png',
    'apple-icon.png'
  ];
  
  iconFiles.forEach(iconFile => {
    const iconPath = path.join(__dirname, '../public', iconFile);
    fs.copyFileSync(sourcePath, iconPath);
    console.log(`✅ ${iconFile} updated`);
  });
  
  console.log('✅ All logo files updated!');
} catch (error) {
  console.error('❌ Error converting logo:', error);
  process.exit(1);
}

