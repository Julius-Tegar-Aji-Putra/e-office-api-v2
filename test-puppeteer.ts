/**
 * Test script untuk Puppeteer Chrome installation
 * Jalankan: bun test-puppeteer.ts
 */

import puppeteer from 'puppeteer';

console.log('🔍 Testing Puppeteer Chrome installation...\n');

try {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  console.log('✅ Chrome browser launched successfully!');
  
  const page = await browser.newPage();
  await page.setContent('<h1>Test PDF Generation</h1><p>Puppeteer is working!</p>');
  
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true
  });
  
  console.log(`✅ PDF generated successfully! Size: ${pdf.length} bytes`);
  
  await browser.close();
  
  console.log('\n✅ ALL TESTS PASSED! Puppeteer is configured correctly.\n');
  
} catch (error) {
  console.error('❌ ERROR:', error.message);
  console.error('\n🔧 SOLUTION:');
  console.error('   Run: bunx puppeteer browsers install chrome');
  console.error('   Or see: PUPPETEER_SETUP.md\n');
  process.exit(1);
}
