/**
 * Postinstall script to remove problematic test files from thread-stream
 * that cause Turbopack build errors.
 * 
 * This is a workaround for WalletConnect dependencies that include
 * test files and non-code assets that Turbopack tries to parse.
 */

const fs = require('fs')
const path = require('path')

function findThreadStreamDirs() {
  const dirs = []
  
  // Try to find thread-stream in node_modules
  const possiblePaths = [
    path.join(process.cwd(), 'node_modules', 'thread-stream'),
    path.join(process.cwd(), 'node_modules', '.pnpm', 'thread-stream@3.1.0', 'node_modules', 'thread-stream'),
  ]

  for (const dir of possiblePaths) {
    if (fs.existsSync(dir)) {
      dirs.push(dir)
    }
  }

  // Try to find it by searching in .pnpm
  const pnpmDir = path.join(process.cwd(), 'node_modules', '.pnpm')
  if (fs.existsSync(pnpmDir)) {
    try {
      const entries = fs.readdirSync(pnpmDir)
      for (const entry of entries) {
        if (entry.startsWith('thread-stream@')) {
          const threadStreamPath = path.join(pnpmDir, entry, 'node_modules', 'thread-stream')
          if (fs.existsSync(threadStreamPath)) {
            dirs.push(threadStreamPath)
          }
        }
      }
    } catch (e) {
      // Ignore readdir errors
    }
  }

  return dirs
}

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true })
      console.log(`[postinstall] ✓ Removed directory: ${dirPath}`)
      return true
    } catch (e) {
      console.warn(`[postinstall] ⚠ Failed to remove directory ${dirPath}:`, e.message)
      return false
    }
  }
  return false
}

function removeFile(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath)
      console.log(`[postinstall] ✓ Removed file: ${filePath}`)
      return true
    } catch (e) {
      console.warn(`[postinstall] ⚠ Failed to remove file ${filePath}:`, e.message)
      return false
    }
  }
  return false
}

function cleanThreadStream() {
  console.log('[postinstall] Starting thread-stream cleanup...')
  
  const threadStreamDirs = findThreadStreamDirs()
  
  if (threadStreamDirs.length === 0) {
    console.log('[postinstall] ⚠ thread-stream not found, skipping cleanup')
    return
  }

  let cleaned = 0
  for (const threadStreamDir of threadStreamDirs) {
    console.log(`[postinstall] Cleaning thread-stream at: ${threadStreamDir}`)

    // Remove test directory
    if (removeDir(path.join(threadStreamDir, 'test'))) cleaned++
    
    // Remove bench directory
    if (removeDir(path.join(threadStreamDir, 'bench'))) cleaned++
    
    // Remove problematic files
    if (removeFile(path.join(threadStreamDir, 'README.md'))) cleaned++
    if (removeFile(path.join(threadStreamDir, 'LICENSE'))) cleaned++
    if (removeFile(path.join(threadStreamDir, 'bench.js'))) cleaned++
  }

  console.log(`[postinstall] ✓ Cleanup complete. Removed ${cleaned} items.`)
}

try {
  cleanThreadStream()
} catch (error) {
  console.error('[postinstall] ✗ Error cleaning thread-stream:', error.message)
  console.error(error.stack)
  // Don't fail the install if cleanup fails
  process.exit(0)
}

