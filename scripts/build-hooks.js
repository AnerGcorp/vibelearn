#!/usr/bin/env node

/**
 * Build script for vibelearn hooks
 * Bundles TypeScript hooks into individual standalone executables using esbuild
 */

import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WORKER_SERVICE = {
  name: 'worker-service',
  source: 'src/services/worker-service.ts'
};

const MCP_SERVER = {
  name: 'mcp-server',
  source: 'src/servers/mcp-server.ts'
};

const VL_CLI = {
  name: 'vl-cli',
  source: 'src/cli/vl/index.ts'
};

async function buildHooks() {
  console.log('🔨 Building vibelearn hooks and worker service...\n');

  try {
    // Read version from package.json
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    const version = packageJson.version;
    console.log(`📌 Version: ${version}`);

    // Create output directories
    console.log('\n📦 Preparing output directories...');
    const hooksDir = 'plugin/scripts';

    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true });
    }
    console.log('✓ Output directories ready');

    // Generate plugin/package.json for cache directory dependency installation
    // Note: bun:sqlite is a Bun built-in, no external dependencies needed for SQLite
    console.log('\n📦 Generating plugin package.json...');
    const pluginPackageJson = {
      name: 'vibelearn',
      version: version,
      private: true,
      description: 'Runtime dependencies for vibelearn bundled hooks',
      type: 'module',
      dependencies: {
        'tree-sitter-cli': '^0.26.5',
        'tree-sitter-c': '^0.24.1',
        'tree-sitter-cpp': '^0.23.4',
        'tree-sitter-go': '^0.25.0',
        'tree-sitter-java': '^0.23.5',
        'tree-sitter-javascript': '^0.25.0',
        'tree-sitter-python': '^0.25.0',
        'tree-sitter-ruby': '^0.23.1',
        'tree-sitter-rust': '^0.24.0',
        'tree-sitter-typescript': '^0.23.2',
      },
      engines: {
        node: '>=18.0.0',
        bun: '>=1.0.0'
      }
    };
    fs.writeFileSync('plugin/package.json', JSON.stringify(pluginPackageJson, null, 2) + '\n');
    console.log('✓ plugin/package.json generated');

    // Build worker service
    console.log(`\n🔧 Building worker service...`);
    await build({
      entryPoints: [WORKER_SERVICE.source],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      outfile: `${hooksDir}/${WORKER_SERVICE.name}.cjs`,
      minify: true,
      logLevel: 'error', // Suppress warnings (import.meta warning is benign)
      external: [
        'bun:sqlite',
        // Optional chromadb embedding providers
        'cohere-ai',
        'ollama',
        // Default embedding function with native binaries
        '@chroma-core/default-embed',
        'onnxruntime-node'
      ],
      define: {
        '__DEFAULT_PACKAGE_VERSION__': `"${version}"`
      },
      banner: {
        js: '#!/usr/bin/env bun'
      }
    });

    // Make worker service executable
    fs.chmodSync(`${hooksDir}/${WORKER_SERVICE.name}.cjs`, 0o755);
    const workerStats = fs.statSync(`${hooksDir}/${WORKER_SERVICE.name}.cjs`);
    console.log(`✓ worker-service built (${(workerStats.size / 1024).toFixed(2)} KB)`);

    // Build MCP server
    console.log(`\n🔧 Building MCP server...`);
    await build({
      entryPoints: [MCP_SERVER.source],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      outfile: `${hooksDir}/${MCP_SERVER.name}.cjs`,
      minify: true,
      logLevel: 'error',
      external: [
        'bun:sqlite',
        'tree-sitter-cli',
        'tree-sitter-javascript',
        'tree-sitter-typescript',
        'tree-sitter-python',
        'tree-sitter-go',
        'tree-sitter-rust',
        'tree-sitter-ruby',
        'tree-sitter-java',
        'tree-sitter-c',
        'tree-sitter-cpp',
      ],
      define: {
        '__DEFAULT_PACKAGE_VERSION__': `"${version}"`
      },
      banner: {
        js: '#!/usr/bin/env node'
      }
    });

    // Make MCP server executable
    fs.chmodSync(`${hooksDir}/${MCP_SERVER.name}.cjs`, 0o755);
    const mcpServerStats = fs.statSync(`${hooksDir}/${MCP_SERVER.name}.cjs`);
    console.log(`✓ mcp-server built (${(mcpServerStats.size / 1024).toFixed(2)} KB)`);

    // Build vl CLI
    console.log(`\n🔧 Building vl CLI...`);
    await build({
      entryPoints: [VL_CLI.source],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      outfile: `${hooksDir}/${VL_CLI.name}.cjs`,
      minify: true,
      logLevel: 'error',
      external: ['bun:sqlite'],
      define: {
        '__DEFAULT_PACKAGE_VERSION__': `"${version}"`
      },
      banner: {
        js: '#!/usr/bin/env bun'
      }
    });

    fs.chmodSync(`${hooksDir}/${VL_CLI.name}.cjs`, 0o755);
    const vlStats = fs.statSync(`${hooksDir}/${VL_CLI.name}.cjs`);
    console.log(`✓ vl-cli built (${(vlStats.size / 1024).toFixed(2)} KB)`);

    // Verify critical distribution files exist
    console.log('\n📋 Verifying distribution files...');
    const requiredDistributionFiles = [
      'plugin/hooks/hooks.json',
      'plugin/.claude-plugin/plugin.json',
    ];
    for (const filePath of requiredDistributionFiles) {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Missing required distribution file: ${filePath}`);
      }
    }
    console.log('✓ All required distribution files present');

    console.log('\n✅ VibeLearn worker, MCP server, and vl CLI built successfully!');
    console.log(`   Output: ${hooksDir}/`);
    console.log(`   - Worker: worker-service.cjs`);
    console.log(`   - MCP Server: mcp-server.cjs`);
    console.log(`   - vl CLI: vl-cli.cjs`);

  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    if (error.errors) {
      console.error('\nBuild errors:');
      error.errors.forEach(err => console.error(`  - ${err.text}`));
    }
    process.exit(1);
  }
}

buildHooks();
