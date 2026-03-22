/**
 * StackDetector
 *
 * Reads package.json, pyproject.toml, Cargo.toml, go.mod etc. from files
 * observed during a session to detect the tech stack.
 *
 * Returns a vl_stack_profiles-shaped record.
 */

import { readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { logger } from '../../utils/logger.js';

export interface StackProfile {
  session_id: string;
  language_json: string;       // JSON array of languages
  framework: string | null;
  orm: string | null;
  state_management: string | null;
  testing_json: string;        // JSON array of testing tools
  auth: string | null;
  styling_json: string;        // JSON array of styling tools
  confidence_json: string;     // JSON object of confidence scores
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  name?: string;
}

/**
 * Detect stack from the package files observed in a session.
 *
 * @param sessionId The content session ID
 * @param observedFilePaths All file paths touched during the session
 * @param cwd The project working directory
 */
export function detectStack(
  sessionId: string,
  observedFilePaths: string[],
  cwd: string
): StackProfile {
  const languages: string[] = [];
  let framework: string | null = null;
  let orm: string | null = null;
  let stateManagement: string | null = null;
  const testing: string[] = [];
  let auth: string | null = null;
  const styling: string[] = [];
  const confidence: Record<string, number> = {};

  // Detect language from file extensions observed
  const extensions = observedFilePaths.map(p => p.split('.').pop()?.toLowerCase() ?? '');
  const extSet = new Set(extensions);
  if (extSet.has('ts') || extSet.has('tsx')) languages.push('TypeScript');
  if (extSet.has('js') || extSet.has('jsx')) {
    if (!languages.includes('TypeScript')) languages.push('JavaScript');
  }
  if (extSet.has('py')) languages.push('Python');
  if (extSet.has('go')) languages.push('Go');
  if (extSet.has('rs')) languages.push('Rust');
  if (extSet.has('rb')) languages.push('Ruby');
  if (extSet.has('java')) languages.push('Java');

  // Try reading package.json from cwd
  const packageJsonPath = join(cwd, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const pkg: PackageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Framework detection (ordered by specificity)
      if (allDeps['next']) { framework = 'Next.js'; confidence.framework = 1.0; }
      else if (allDeps['nuxt'] || allDeps['nuxt3']) { framework = 'Nuxt'; confidence.framework = 1.0; }
      else if (allDeps['@sveltejs/kit']) { framework = 'SvelteKit'; confidence.framework = 1.0; }
      else if (allDeps['remix'] || allDeps['@remix-run/react']) { framework = 'Remix'; confidence.framework = 1.0; }
      else if (allDeps['react']) { framework = 'React'; confidence.framework = 0.9; }
      else if (allDeps['vue']) { framework = 'Vue'; confidence.framework = 1.0; }
      else if (allDeps['svelte']) { framework = 'Svelte'; confidence.framework = 1.0; }
      else if (allDeps['express']) { framework = 'Express'; confidence.framework = 1.0; }
      else if (allDeps['fastify']) { framework = 'Fastify'; confidence.framework = 1.0; }
      else if (allDeps['hono']) { framework = 'Hono'; confidence.framework = 1.0; }
      else if (allDeps['@nestjs/core']) { framework = 'NestJS'; confidence.framework = 1.0; }
      else if (allDeps['koa']) { framework = 'Koa'; confidence.framework = 1.0; }

      // ORM detection
      if (allDeps['prisma'] || allDeps['@prisma/client']) { orm = 'Prisma'; confidence.orm = 1.0; }
      else if (allDeps['drizzle-orm']) { orm = 'Drizzle'; confidence.orm = 1.0; }
      else if (allDeps['mongoose']) { orm = 'Mongoose'; confidence.orm = 1.0; }
      else if (allDeps['sequelize']) { orm = 'Sequelize'; confidence.orm = 1.0; }
      else if (allDeps['typeorm']) { orm = 'TypeORM'; confidence.orm = 1.0; }
      else if (allDeps['kysely']) { orm = 'Kysely'; confidence.orm = 1.0; }

      // State management
      if (allDeps['zustand']) { stateManagement = 'Zustand'; confidence.state = 1.0; }
      else if (allDeps['jotai']) { stateManagement = 'Jotai'; confidence.state = 1.0; }
      else if (allDeps['@reduxjs/toolkit'] || allDeps['redux']) { stateManagement = 'Redux'; confidence.state = 1.0; }
      else if (allDeps['recoil']) { stateManagement = 'Recoil'; confidence.state = 1.0; }
      else if (allDeps['mobx']) { stateManagement = 'MobX'; confidence.state = 1.0; }
      else if (allDeps['valtio']) { stateManagement = 'Valtio'; confidence.state = 1.0; }

      // Auth
      if (allDeps['next-auth'] || allDeps['next-auth']) { auth = 'NextAuth'; confidence.auth = 1.0; }
      else if (allDeps['@auth/core']) { auth = 'Auth.js'; confidence.auth = 1.0; }
      else if (allDeps['lucia']) { auth = 'Lucia'; confidence.auth = 1.0; }
      else if (allDeps['better-auth']) { auth = 'Better Auth'; confidence.auth = 1.0; }
      else if (allDeps['passport']) { auth = 'Passport'; confidence.auth = 1.0; }
      else if (allDeps['jsonwebtoken']) { auth = 'JWT'; confidence.auth = 0.8; }
      else if (allDeps['@clerk/nextjs'] || allDeps['@clerk/clerk-sdk-node']) { auth = 'Clerk'; confidence.auth = 1.0; }

      // Styling
      if (allDeps['tailwindcss']) { styling.push('Tailwind CSS'); confidence.styling = 1.0; }
      if (allDeps['styled-components']) styling.push('styled-components');
      if (allDeps['@emotion/react']) styling.push('Emotion');
      if (allDeps['sass'] || allDeps['node-sass']) styling.push('Sass');

      // Testing
      if (allDeps['vitest']) testing.push('Vitest');
      if (allDeps['jest']) testing.push('Jest');
      if (allDeps['@playwright/test']) testing.push('Playwright');
      if (allDeps['cypress']) testing.push('Cypress');
      if (allDeps['mocha']) testing.push('Mocha');

      if (languages.length === 0) languages.push('JavaScript/TypeScript');
    } catch (err) {
      logger.debug('STACK', 'Failed to parse package.json', { path: packageJsonPath }, err as Error);
    }
  }

  // Try pyproject.toml for Python projects
  const pyprojectPath = join(cwd, 'pyproject.toml');
  if (existsSync(pyprojectPath)) {
    try {
      const content = readFileSync(pyprojectPath, 'utf-8');
      if (!languages.includes('Python')) languages.push('Python');
      if (/fastapi/i.test(content)) { framework = 'FastAPI'; confidence.framework = 1.0; }
      else if (/django/i.test(content)) { framework = 'Django'; confidence.framework = 1.0; }
      else if (/flask/i.test(content)) { framework = 'Flask'; confidence.framework = 1.0; }
      if (/sqlalchemy/i.test(content)) { orm = 'SQLAlchemy'; confidence.orm = 1.0; }
      if (/pytest/i.test(content)) testing.push('pytest');
    } catch {
      // silently skip
    }
  }

  // Try go.mod for Go projects
  if (existsSync(join(cwd, 'go.mod'))) {
    if (!languages.includes('Go')) languages.push('Go');
    try {
      const content = readFileSync(join(cwd, 'go.mod'), 'utf-8');
      if (/gin-gonic\/gin/i.test(content)) { framework = 'Gin'; confidence.framework = 1.0; }
      else if (/gofiber\/fiber/i.test(content)) { framework = 'Fiber'; confidence.framework = 1.0; }
      else if (/labstack\/echo/i.test(content)) { framework = 'Echo'; confidence.framework = 1.0; }
    } catch {
      // silently skip
    }
  }

  return {
    session_id: sessionId,
    language_json: JSON.stringify(languages),
    framework,
    orm,
    state_management: stateManagement,
    testing_json: JSON.stringify(testing),
    auth,
    styling_json: JSON.stringify(styling),
    confidence_json: JSON.stringify(confidence)
  };
}
