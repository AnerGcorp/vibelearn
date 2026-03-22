/**
 * StaticAnalyzer tests
 *
 * Verifies regex-based pattern detection across all supported languages.
 * Covers the full POC signal set: TS/JS, Python, Go, Rust, Ruby, C#.
 */

import { describe, it, expect } from 'bun:test';
import { analyzeFiles } from '../../src/services/analysis/StaticAnalyzer.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function analyze(filePath: string, content: string) {
  return analyzeFiles([{ file_path: filePath, content }]);
}

function hasPattern(patterns: ReturnType<typeof analyzeFiles>, type: string) {
  return patterns.some(p => p.pattern_type === type);
}

function patternName(patterns: ReturnType<typeof analyzeFiles>, type: string) {
  return patterns.find(p => p.pattern_type === type)?.name;
}

// ─── TypeScript / JavaScript ─────────────────────────────────────────────────

describe('StaticAnalyzer — TypeScript/JavaScript', () => {
  it('detects custom React hook (useXxx)', () => {
    const ps = analyze('app.ts', 'export function useMyHook(id: string) {\n  return useState(id);\n}');
    expect(hasPattern(ps, 'custom_hook')).toBe(true);
    expect(patternName(ps, 'custom_hook')).toBe('useMyHook');
  });

  it('detects useEffect', () => {
    const ps = analyze('app.tsx', '  useEffect(() => { fetch(url); }, [url]);');
    expect(hasPattern(ps, 'react_hook')).toBe(true);
    expect(patternName(ps, 'react_hook')).toBe('useEffect');
  });

  it('detects useState', () => {
    const ps = analyze('app.tsx', 'const [count, setCount] = useState(0);');
    expect(hasPattern(ps, 'react_hook')).toBe(true);
    expect(patternName(ps, 'react_hook')).toBe('useState');
  });

  it('detects useReducer', () => {
    const ps = analyze('app.tsx', 'const [state, dispatch] = useReducer(reducer, initialState);');
    expect(hasPattern(ps, 'react_hook')).toBe(true);
    expect(patternName(ps, 'react_hook')).toBe('useReducer');
  });

  it('detects useCallback', () => {
    const ps = analyze('app.tsx', 'const cb = useCallback(() => doThing(), [dep]);');
    expect(hasPattern(ps, 'react_hook')).toBe(true);
    expect(patternName(ps, 'react_hook')).toBe('useCallback');
  });

  it('detects server action directive', () => {
    const ps = analyze('actions.ts', "'use server';\nexport async function create() {}");
    expect(hasPattern(ps, 'server_action')).toBe(true);
  });

  it('detects client component directive', () => {
    const ps = analyze('Card.tsx', '"use client";\nfunction Card() {}');
    expect(hasPattern(ps, 'client_component')).toBe(true);
  });

  it('detects Express route', () => {
    const ps = analyze('routes.ts', "app.post('/users', async (req, res) => {});");
    expect(hasPattern(ps, 'api_route')).toBe(true);
    expect(patternName(ps, 'api_route')).toBe('POST /users');
  });

  it('detects Next.js App Router handler', () => {
    const ps = analyze('route.ts', 'export async function GET(req: Request) {}');
    expect(hasPattern(ps, 'api_route')).toBe(true);
    expect(patternName(ps, 'api_route')).toContain('GET');
  });

  it('detects TypeScript interface', () => {
    const ps = analyze('types.ts', 'export interface UserProfile { id: string; }');
    expect(hasPattern(ps, 'typescript_interface')).toBe(true);
    expect(patternName(ps, 'typescript_interface')).toBe('UserProfile');
  });

  it('detects TypeScript type alias', () => {
    const ps = analyze('types.ts', 'export type UserId = string;');
    expect(hasPattern(ps, 'typescript_type')).toBe(true);
    expect(patternName(ps, 'typescript_type')).toBe('UserId');
  });

  it('detects class definition', () => {
    const ps = analyze('service.ts', 'export class AuthService implements IAuthService {');
    expect(hasPattern(ps, 'class_definition')).toBe(true);
    expect(patternName(ps, 'class_definition')).toBe('AuthService');
  });

  it('detects layered architecture (Service suffix)', () => {
    const ps = analyze('user.service.ts', 'export class UserService {');
    expect(hasPattern(ps, 'layered_architecture')).toBe(true);
    expect(patternName(ps, 'layered_architecture')).toBe('UserService');
  });

  it('detects Repository suffix', () => {
    const ps = analyze('user.repo.ts', 'class UserRepository extends BaseRepo {');
    expect(hasPattern(ps, 'layered_architecture')).toBe(true);
  });

  it('detects singleton pattern (getInstance)', () => {
    const ps = analyze('db.ts', '  static getInstance() { return this._instance; }');
    expect(hasPattern(ps, 'singleton_pattern')).toBe(true);
  });

  it('detects async function', () => {
    const ps = analyze('api.ts', 'async function fetchUser(id: string) {');
    expect(hasPattern(ps, 'async_function')).toBe(true);
  });

  it('detects await expression', () => {
    const ps = analyze('api.ts', '  const user = await db.findUser(id);');
    expect(hasPattern(ps, 'await_expression')).toBe(true);
  });

  it('detects Promise.all', () => {
    const ps = analyze('parallel.ts', 'const [a, b] = await Promise.all([fetchA(), fetchB()]);');
    expect(hasPattern(ps, 'promise_combinator')).toBe(true);
    expect(patternName(ps, 'promise_combinator')).toBe('Promise.all');
  });

  it('detects try-catch in async context as async_error_handling', () => {
    const ps = analyze('handler.ts', 'async function handle() {\n  try {\n    await doWork();\n  } catch(e) {}');
    expect(hasPattern(ps, 'async_error_handling')).toBe(true);
  });

  it('detects Array.reduce as functional pattern', () => {
    const ps = analyze('utils.ts', 'const total = items.reduce((acc, x) => acc + x.price, 0);');
    expect(hasPattern(ps, 'functional_reduce')).toBe(true);
  });

  it('detects Prisma query', () => {
    const ps = analyze('repo.ts', 'const users = await prisma.user.findMany({ where: { active: true } });');
    expect(hasPattern(ps, 'database_query')).toBe(true);
    expect(patternName(ps, 'database_query')).toBe('Prisma findMany');
  });

  it('detects Redux createSlice', () => {
    const ps = analyze('userSlice.ts', "const userSlice = createSlice({ name: 'user', initialState, reducers: {} });");
    expect(hasPattern(ps, 'redux_slice')).toBe(true);
  });

  it('detects Zustand store', () => {
    const ps = analyze('store.ts', 'const useStore = create((set) => ({ count: 0 }));');
    expect(hasPattern(ps, 'zustand_store')).toBe(true);
  });

  it('detects observer pattern (emit + on in same file)', () => {
    const content = "emitter.on('data', handler);\n// ...\nemitter.emit('data', payload);";
    const ps = analyze('events.ts', content);
    expect(hasPattern(ps, 'observer_pattern')).toBe(true);
  });

  it('deduplicates identical patterns', () => {
    const content = 'const a = await fetch("/a");\nconst b = await fetch("/b");';
    const ps = analyze('api.ts', content);
    const awaitPatterns = ps.filter(p => p.pattern_type === 'await_expression');
    // Both lines have await — deduplication is by type+name+file so both should appear
    // (same name "await", same file → only 1 after dedup)
    expect(awaitPatterns.length).toBe(1);
  });

  it('skips files larger than 100KB', () => {
    const bigContent = 'x'.repeat(101 * 1024);
    const ps = analyzeFiles([{ file_path: 'big.ts', content: bigContent }]);
    expect(ps).toHaveLength(0);
  });

  it('skips unsupported file extensions', () => {
    const ps = analyze('schema.prisma', 'model User { id Int @id }');
    expect(ps).toHaveLength(0);
  });
});

// ─── Python ──────────────────────────────────────────────────────────────────

describe('StaticAnalyzer — Python', () => {
  it('detects async def', () => {
    const ps = analyze('main.py', 'async def fetch_user(user_id: str) -> dict:');
    expect(hasPattern(ps, 'async_function')).toBe(true);
  });

  it('detects generator yield', () => {
    const ps = analyze('gen.py', '    yield item');
    expect(hasPattern(ps, 'generator')).toBe(true);
  });

  it('detects try-except', () => {
    const ps = analyze('handler.py', 'try:\n    result = fetch()\nexcept Exception as e:');
    expect(hasPattern(ps, 'error_handling')).toBe(true);
  });

  it('detects list comprehension', () => {
    const ps = analyze('utils.py', 'squares = [x**2 for x in range(10)]');
    expect(hasPattern(ps, 'list_comprehension')).toBe(true);
  });

  it('detects @property decorator', () => {
    const ps = analyze('model.py', '    @property\n    def full_name(self):');
    expect(hasPattern(ps, 'oop_decorator')).toBe(true);
  });

  it('detects @lru_cache', () => {
    const ps = analyze('cache.py', '@lru_cache(maxsize=128)\ndef expensive(n):');
    expect(hasPattern(ps, 'memoization')).toBe(true);
  });

  it('detects class definition', () => {
    const ps = analyze('models.py', 'class UserProfile(BaseModel):');
    expect(hasPattern(ps, 'class_definition')).toBe(true);
    expect(patternName(ps, 'class_definition')).toBe('UserProfile');
  });

  it('detects typed function signature', () => {
    const ps = analyze('api.py', 'def get_user(user_id: str) -> Optional[User]:');
    expect(hasPattern(ps, 'type_annotation')).toBe(true);
  });
});

// ─── Go ──────────────────────────────────────────────────────────────────────

describe('StaticAnalyzer — Go', () => {
  it('detects goroutine spawn', () => {
    const ps = analyze('server.go', '    go handleConn(conn)');
    expect(hasPattern(ps, 'goroutine_spawn')).toBe(true);
  });

  it('detects channel communication', () => {
    const ps = analyze('worker.go', '    ch <- result');
    expect(hasPattern(ps, 'channel_communication')).toBe(true);
  });

  it('detects defer', () => {
    const ps = analyze('db.go', '    defer db.Close()');
    expect(hasPattern(ps, 'defer_cleanup')).toBe(true);
  });

  it('detects err != nil check', () => {
    const ps = analyze('handler.go', '    if err != nil { return err }');
    expect(hasPattern(ps, 'error_nil_check')).toBe(true);
  });

  it('detects interface definition', () => {
    const ps = analyze('repo.go', 'type UserRepository interface {');
    expect(hasPattern(ps, 'interface_definition')).toBe(true);
    expect(patternName(ps, 'interface_definition')).toBe('UserRepository');
  });

  it('detects context propagation', () => {
    const ps = analyze('service.go', 'func (s *Service) GetUser(ctx context.Context, id string) (*User, error) {');
    expect(hasPattern(ps, 'context_propagation')).toBe(true);
  });

  it('detects struct definition', () => {
    const ps = analyze('model.go', 'type User struct {');
    expect(hasPattern(ps, 'struct_definition')).toBe(true);
    expect(patternName(ps, 'struct_definition')).toBe('User');
  });
});

// ─── Rust ─────────────────────────────────────────────────────────────────────

describe('StaticAnalyzer — Rust', () => {
  it('detects .await', () => {
    const ps = analyze('main.rs', '    let user = db.find_user(id).await?;');
    expect(hasPattern(ps, 'await_expression')).toBe(true);
  });

  it('detects async fn', () => {
    const ps = analyze('handler.rs', 'async fn handle_request(req: Request) -> Response {');
    expect(hasPattern(ps, 'async_function')).toBe(true);
  });

  it('detects trait implementation', () => {
    const ps = analyze('service.rs', 'impl UserService for UserServiceImpl {');
    expect(hasPattern(ps, 'trait_impl')).toBe(true);
  });

  it('detects ? error propagation', () => {
    const ps = analyze('main.rs', '    let conn = pool.get()?;');
    expect(hasPattern(ps, 'error_propagation')).toBe(true);
  });

  it('detects derive macros', () => {
    const ps = analyze('model.rs', '#[derive(Debug, Clone, Serialize, Deserialize)]');
    expect(hasPattern(ps, 'derive_macros')).toBe(true);
  });

  it('detects spawn', () => {
    const ps = analyze('worker.rs', '    tokio::spawn(async move { process(task).await });');
    expect(hasPattern(ps, 'concurrent_spawn')).toBe(true);
  });

  it('detects enum definition', () => {
    const ps = analyze('types.rs', 'pub enum AppError {');
    expect(hasPattern(ps, 'enum_definition')).toBe(true);
    expect(patternName(ps, 'enum_definition')).toBe('AppError');
  });
});

// ─── Ruby ─────────────────────────────────────────────────────────────────────

describe('StaticAnalyzer — Ruby', () => {
  it('detects class inheritance', () => {
    const ps = analyze('user.rb', 'class User < ApplicationRecord');
    expect(hasPattern(ps, 'class_inheritance')).toBe(true);
    expect(patternName(ps, 'class_inheritance')).toBe('User < ApplicationRecord');
  });

  it('detects module mixin (include)', () => {
    const ps = analyze('user.rb', '  include Authenticatable');
    expect(hasPattern(ps, 'module_mixin')).toBe(true);
    expect(patternName(ps, 'module_mixin')).toBe('include Authenticatable');
  });

  it('detects block with do', () => {
    const ps = analyze('migration.rb', '  items.each do |item|');
    expect(hasPattern(ps, 'block_usage')).toBe(true);
  });

  it('detects Rails DSL (has_many)', () => {
    const ps = analyze('user.rb', '  has_many :posts, dependent: :destroy');
    expect(hasPattern(ps, 'rails_dsl')).toBe(true);
  });

  it('detects Rails DSL (validates)', () => {
    const ps = analyze('user.rb', "  validates :email, presence: true, uniqueness: true");
    expect(hasPattern(ps, 'rails_dsl')).toBe(true);
  });

  it('detects RSpec describe', () => {
    const ps = analyze('user_spec.rb', "describe 'User authentication' do");
    expect(hasPattern(ps, 'rspec_pattern')).toBe(true);
  });
});

// ─── C# ──────────────────────────────────────────────────────────────────────

describe('StaticAnalyzer — C#', () => {
  it('detects await', () => {
    const ps = analyze('Service.cs', '    var user = await _repo.GetByIdAsync(id);');
    expect(hasPattern(ps, 'await_expression')).toBe(true);
  });

  it('detects async Task method', () => {
    const ps = analyze('Controller.cs', '    public async Task<IActionResult> GetUser(int id)');
    expect(hasPattern(ps, 'async_function')).toBe(true);
  });

  it('detects interface definition', () => {
    const ps = analyze('IUserRepo.cs', 'public interface IUserRepository {');
    expect(hasPattern(ps, 'interface_definition')).toBe(true);
    expect(patternName(ps, 'interface_definition')).toBe('IUserRepository');
  });

  it('detects attribute decoration', () => {
    const ps = analyze('Controller.cs', '    [HttpGet("{id}")]');
    expect(hasPattern(ps, 'attribute_decoration')).toBe(true);
  });

  it('detects LINQ', () => {
    const ps = analyze('Repo.cs', '    var active = users.Where(u => u.IsActive).Select(u => u.Name);');
    expect(hasPattern(ps, 'linq_usage')).toBe(true);
  });

  it('detects class definition', () => {
    const ps = analyze('Service.cs', 'public class UserService : IUserService {');
    expect(hasPattern(ps, 'class_definition')).toBe(true);
    expect(patternName(ps, 'class_definition')).toBe('UserService');
  });
});

// ─── Multi-file ───────────────────────────────────────────────────────────────

describe('StaticAnalyzer — multi-file', () => {
  it('analyzes multiple files in one call', () => {
    const ps = analyzeFiles([
      { file_path: 'auth.ts', content: "export interface IAuth { login(): Promise<void>; }" },
      { file_path: 'handler.go', content: "    if err != nil { return err }" },
    ]);
    expect(hasPattern(ps, 'typescript_interface')).toBe(true);
    expect(hasPattern(ps, 'error_nil_check')).toBe(true);
  });

  it('does not mix patterns across files', () => {
    const ps = analyzeFiles([
      { file_path: 'a.ts', content: 'export interface Foo {}' },
      { file_path: 'b.ts', content: 'export interface Foo {}' },
    ]);
    // Both files have "interface Foo" — different file paths → both kept
    const ifaces = ps.filter(p => p.pattern_type === 'typescript_interface' && p.name === 'Foo');
    expect(ifaces.length).toBe(2);
    expect(ifaces[0].file_path).toBe('a.ts');
    expect(ifaces[1].file_path).toBe('b.ts');
  });
});
