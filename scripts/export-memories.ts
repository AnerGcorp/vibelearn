#!/usr/bin/env node
/**
 * Export memories matching a search query to a portable JSON format
 * Usage: npx tsx scripts/export-memories.ts <query> <output-file> [--project=name]
 * Example: npx tsx scripts/export-memories.ts "windows" windows-memories.json --project=vibelearn
 */

import { writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { SettingsDefaultsManager } from '../src/shared/SettingsDefaultsManager';
import type {
  ObservationRecord,
  SdkSessionRecord,
  SessionSummaryRecord,
  UserPromptRecord,
  ExportData
} from './types/export.js';

async function exportMemories(query: string, outputFile: string, project?: string) {
  try {
    // Read port from settings
    const settings = SettingsDefaultsManager.loadFromFile(join(homedir(), '.vibelearn', 'settings.json'));
    const port = parseInt(settings.VIBELEARN_WORKER_PORT, 10);
    const baseUrl = `http://localhost:${port}`;

    console.log(`🔍 Searching for: "${query}"${project ? ` (project: ${project})` : ' (all projects)'}`);

    // Build query params - use format=json for raw data
    const params = new URLSearchParams({
      query,
      format: 'json',
      limit: '999999'
    });
    if (project) params.set('project', project);

    // Unified search - gets all result types using hybrid search
    console.log('📡 Fetching all memories via hybrid search...');
    const searchResponse = await fetch(`${baseUrl}/api/search?${params.toString()}`);
    if (!searchResponse.ok) {
      throw new Error(`Failed to search: ${searchResponse.status} ${searchResponse.statusText}`);
    }
    const searchData = await searchResponse.json();

    const observations: ObservationRecord[] = searchData.observations || [];
    const summaries: SessionSummaryRecord[] = searchData.sessions || [];
    const prompts: UserPromptRecord[] = searchData.prompts || [];

    console.log(`✅ Found ${observations.length} observations`);
    console.log(`✅ Found ${summaries.length} session summaries`);
    console.log(`✅ Found ${prompts.length} user prompts`);

    // Get unique memory session IDs from observations and summaries
    const memorySessionIds = new Set<string>();
    observations.forEach((o) => {
      if (o.memory_session_id) memorySessionIds.add(o.memory_session_id);
    });
    summaries.forEach((s) => {
      if (s.memory_session_id) memorySessionIds.add(s.memory_session_id);
    });

    // Get SDK sessions metadata via API
    console.log('📡 Fetching SDK sessions metadata...');
    let sessions: SdkSessionRecord[] = [];
    if (memorySessionIds.size > 0) {
      const sessionsResponse = await fetch(`${baseUrl}/api/sdk-sessions/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdkSessionIds: Array.from(memorySessionIds) })
      });
      if (sessionsResponse.ok) {
        sessions = await sessionsResponse.json();
      } else {
        console.warn(`⚠️ Failed to fetch SDK sessions: ${sessionsResponse.status}`);
      }
    }
    console.log(`✅ Found ${sessions.length} SDK sessions`);

    // Create export data
    const exportData: ExportData = {
      exportedAt: new Date().toISOString(),
      exportedAtEpoch: Date.now(),
      query,
      project,
      totalObservations: observations.length,
      totalSessions: sessions.length,
      totalSummaries: summaries.length,
      totalPrompts: prompts.length,
      observations,
      sessions,
      summaries,
      prompts
    };

    // Write to file
    writeFileSync(outputFile, JSON.stringify(exportData, null, 2));

    console.log(`\n📦 Export complete!`);
    console.log(`📄 Output: ${outputFile}`);
    console.log(`📊 Stats:`);
    console.log(`   • ${exportData.totalObservations} observations`);
    console.log(`   • ${exportData.totalSessions} sessions`);
    console.log(`   • ${exportData.totalSummaries} summaries`);
    console.log(`   • ${exportData.totalPrompts} prompts`);

  } catch (error) {
    console.error('❌ Export failed:', error);
    process.exit(1);
  }
}

// CLI interface
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: npx tsx scripts/export-memories.ts <query> <output-file> [--project=name]');
  console.error('Example: npx tsx scripts/export-memories.ts "windows" windows-memories.json --project=vibelearn');
  console.error('         npx tsx scripts/export-memories.ts "authentication" auth.json');
  process.exit(1);
}

// Parse arguments
const [query, outputFile, ...flags] = args;
const project = flags.find(f => f.startsWith('--project='))?.split('=')[1];

exportMemories(query, outputFile, project);
