/**
 * Test QR Code Generation dengan Logo
 * Script untuk test apakah QR Code generation berfungsi dengan benar
 */

import QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

async function getLogoForQRCode(): Promise<string | null> {
  try {
    const logoPath = path.join(process.cwd(), 'public', 'logo-undip.png');
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      console.log(`✅ Logo UNDIP ditemukan: ${logoPath}`);
      return `data:image/png;base64,${logoBuffer.toString('base64')}`;
    }
    
    // Fallback: coba stempel.png sebagai logo
    const stempelPath = path.join(process.cwd(), 'public', 'stempel.png');
    if (fs.existsSync(stempelPath)) {
      const stempelBuffer = fs.readFileSync(stempelPath);
      console.log(`✅ Fallback ke stempel.png: ${stempelPath}`);
      return `data:image/png;base64,${stempelBuffer.toString('base64')}`;
    }
    
    console.log('⚠️ Logo tidak ditemukan');
    return null;
  } catch (error) {
    console.error('❌ Error loading logo:', error);
    return null;
  }
}

async function generateQRCodeWithLogo(
  data: string,
  options: {
    width?: number;
    logoSize?: number;
  } = {}
): Promise<string> {
  const width = options.width || 250;
  const logoSizePercent = options.logoSize || 0.26; // 26% dari QR (lebih besar dengan white frame)
  
  console.log(`\n🔄 Generating QR Code...`);
  console.log(`   Size: ${width}x${width}px`);
  console.log(`   Logo size: ${logoSizePercent * 100}% (${Math.floor(width * logoSizePercent)}px)`);
  
  // Generate QR Code dengan high error correction
  const qrCodeDataUrl = await QRCode.toDataURL(data, {
    errorCorrectionLevel: 'H', // HIGH - bisa terbaca meski 30% tertutup
    type: 'image/png',
    width: width,
    margin: 1,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });

  console.log('✅ QR Code base generated');

  // Load logo
  const logoDataUrl = await getLogoForQRCode();
  
  if (!logoDataUrl) {
    console.log('⚠️ No logo found, using plain QR Code');
    return qrCodeDataUrl;
  }

  try {
    // Decode base64 QR Code
    const qrBase64 = qrCodeDataUrl.split(',')[1];
    const qrBuffer = Buffer.from(qrBase64, 'base64');
    
    // Decode base64 logo
    const logoBase64 = logoDataUrl.split(',')[1];
    const logoBuffer = Buffer.from(logoBase64, 'base64');
    
    // Calculate logo size and position
    const logoSize = Math.floor(width * logoSizePercent);
    const logoPosition = Math.floor((width - logoSize) / 2);
    
    // White frame padding (8px untuk estetika)
    const framePadding = 8;
    const frameSize = logoSize + (framePadding * 2);
    const framePosition = Math.floor((width - frameSize) / 2);
    
    console.log(`   Logo size: ${logoSize}x${logoSize}px`);
    console.log(`   White frame size: ${frameSize}x${frameSize}px (padding: ${framePadding}px)`);
    console.log(`   Frame position: (${framePosition}, ${framePosition})`);
    console.log(`   Logo position: (${logoPosition}, ${logoPosition})`);
    
    // Resize logo dengan padding internal untuk white space
    const logoWithPadding = await sharp(logoBuffer)
      .resize(logoSize - framePadding, logoSize - framePadding, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .extend({
        top: framePadding / 2,
        bottom: framePadding / 2,
        left: framePadding / 2,
        right: framePadding / 2,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png()
      .toBuffer();
    
    console.log('✅ Logo resized with padding');
    
    // Create white background frame
    const whiteFrame = await sharp({
      create: {
        width: frameSize,
        height: frameSize,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
    .png()
    .toBuffer();
    
    console.log('✅ White frame created');
    
    // Composite: QR Code + white frame + logo
    const qrWithLogo = await sharp(qrBuffer)
      .composite([
        {
          input: whiteFrame,
          top: framePosition,
          left: framePosition,
        },
        {
          input: logoWithPadding,
          top: logoPosition,
          left: logoPosition,
        }
      ])
      .png()
      .toBuffer();
    
    console.log('✅ QR Code dengan logo dan white frame berhasil di-composite');
    
    // Save to file for testing
    const outputPath = path.join(process.cwd(), 'test-qr-output.png');
    fs.writeFileSync(outputPath, qrWithLogo);
    console.log(`\n💾 QR Code saved to: ${outputPath}`);
    
    return `data:image/png;base64,${qrWithLogo.toString('base64')}`;
  } catch (error) {
    console.error('❌ Error compositing logo on QR Code:', error);
    return qrCodeDataUrl;
  }
}

// Test function
async function testQRCodeGeneration() {
  console.log('='.repeat(60));
  console.log('🧪 TEST QR CODE GENERATION - SHORT TOKEN');
  console.log('='.repeat(60));
  
  // Sample short token (8-10 karakter)
  const shortToken = '2k4x9pqr';
  const testUrl = `http://192.168.18.36:3000/verify?token=${shortToken}`;
  
  console.log(`\n📝 SHORT TOKEN: ${shortToken}`);
  console.log(`📝 Test URL: ${testUrl}`);
  console.log(`   Length: ${testUrl.length} characters (PENDEK! Mudah di-scan!)`);
  console.log(`\n💡 Bandingkan dengan encrypted token yang ~200+ karakter!`);
  
  try {
    const result = await generateQRCodeWithLogo(testUrl, {
      width: 250,
      logoSize: 0.26, // 26% dengan white frame
    });
    
    console.log('\n✅ QR Code generation SUKSES!');
    console.log(`   Data URL length: ${result.length} characters`);
    console.log('\n📱 Silakan scan file "test-qr-output.png" dengan HP Anda');
    console.log('   File berada di root folder backend');
    console.log('   Logo UNDIP lebih besar dengan white frame!');
    console.log('\n🎯 QR CODE SEKARANG LEBIH SEDERHANA DAN MUDAH DI-SCAN!');
    console.log('   URL pendek = pola QR sederhana = scannability tinggi ✅');
    
  } catch (error) {
    console.error('\n❌ QR Code generation GAGAL:', error);
  }
  
  console.log('\n' + '='.repeat(60));
}

// Run test
testQRCodeGeneration().catch(console.error);
