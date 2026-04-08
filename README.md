# mcp-db-schema-analyze

PostgreSQLのDDL/DMLファイルを読み取り、DB構造を理解した上で会話できるMCPサーバー。

## 概要

生のSQLファイル群(CREATE TABLE, INSERT等)を読み込み、テーブル構造・リレーション・マスタデータを把握した状態で、SQLの組み立てや設計相談をスムーズに行えるようにするツール。

読み取るSQLファイル群は環境変数で切り替え可能。プロジェクトや環境ごとに異なるスキーマセットを扱える。

## 主な機能

- **DDL解析**: テーブル定義、カラム、型、制約、インデックス等を構造化して把握
- **リレーション解析**: 外部キーからテーブル間の関連を抽出
- **同名カラム推定**: FK制約がないレガシースキーマでも、テーブル間で同名のカラム（例: `event_id`）を検出し、暗黙的なリレーション候補として提示
- **マスタデータ参照**: DML(INSERT文)からマスタデータの内容を把握
- **シーケンス/関数解析**: CREATE SEQUENCE, CREATE FUNCTION の定義を個別に参照
- **MCP Tools**:
  - `list-tables` — テーブル一覧の取得
  - `describe-table` — テーブル詳細(カラム、制約、インデックス)の参照
  - `list-relations` — リレーション情報の参照(FK確定 + 同名カラム推定)
  - `list-master-data` — マスタデータの一覧/内容の参照
  - `find-shared-columns` — 複数テーブルに存在する同名カラムの検出
  - `list-sequences` — シーケンス一覧の取得
  - `describe-sequence` — シーケンス定義の参照
  - `list-functions` — 関数一覧の取得
  - `describe-function` — 関数定義の参照

## ユースケース

- 「このテーブルのカラム一覧を教えて」
- 「usersテーブルとordersテーブルの関連は?」
- 「このスキーマでN+1が起きそうなクエリパターンは?」
- 「どんなマスタデータが入ってる?」
- 「event_id というカラムを持つテーブルはどれ?」(FK未定義のレガシースキーマで暗黙的な関連を発見)
- 「新しいテーブルを追加したいが、既存スキーマとの整合性は?」

## 技術スタック

- TypeScript
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) - MCP公式TypeScript SDK
- [pgsql-parser](https://github.com/launchql/pgsql-parser) - PostgreSQL本体のCパーサ(WASM)による100%仕様準拠のSQLパーサ
- [Vitest](https://vitest.dev/) - テスト
- [Biome](https://biomejs.dev/) - フォーマッター / リンター

## SQLファイルの管理構造

本ツールは以下のディレクトリ構造を前提とする:

```
sql/
  ddl/                        -- テーブル関連DDL
    users.sql                 -- CREATE TABLE + COMMENT ON + 関連INDEX + ALTER TABLE
    orders.sql
    order_items.sql
  dml/                        -- マスタデータ(INSERT文)
    roles.sql
    order_statuses.sql
  sequences/                  -- シーケンス定義
    users_id_seq.sql
    order_number_seq.sql
  functions/                  -- 関数定義
    get_user_count.sql
    get_active_users.sql
```

- `ddl/` にはCREATE TABLE, COMMENT ON, CREATE INDEX, ALTER TABLE等を格納
- `dml/` にはマスタデータ投入用のINSERT文を格納
- `sequences/` にはCREATE SEQUENCEを格納
- `functions/` にはCREATE FUNCTIONを格納
- ファイルはテーブル/シーケンス/関数単位で1ファイルに正規化されていることを推奨
- ただし1ファイルに複数ステートメントが混在していても問題なく解析できる

### 前処理CLI (`prepare`)

既存のSQLファイル群が上記の構造になっていない場合、`prepare` コマンドで正規化できる:

```bash
npx mcp-db-schema-analyze prepare \
  --input ./raw-sql/ \
  --output ./sql/
```

`prepare` が行うこと:

1. `--input` 配下の `.sql` ファイルを再帰的に読み取る(空ファイル・コメントのみのファイルはスキップ)
2. pgsql-parserでステートメント単位に分解
3. ステートメントを4カテゴリに自動分類:
   - **DDL** (CREATE TABLE / ALTER TABLE / COMMENT ON / CREATE INDEX) → `ddl/`
   - **DML** (INSERT) → `dml/`
   - **SEQUENCE** (CREATE SEQUENCE) → `sequences/`
   - **FUNCTION** (CREATE FUNCTION) → `functions/`
4. 各カテゴリ内でテーブル/シーケンス/関数単位に1ファイルにまとめる
5. `--output` 配下に出力

元のファイル構成がどのようであっても、正規化された状態でMCPに食わせられるようになる。

#### 設定ファイルによるパス指定

`--config` オプションでJSON設定ファイルからパスを読み取ることもできる:

```bash
node dist/cli.js prepare --config ./mcp-db-schema.json
```

設定ファイルの形式:

```json
{
  "input": ["./raw-sql"],
  "output": "./prepared"
}
```

- 相対パスは **設定ファイルの場所を基準** に解決される
- Windowsのバックスラッシュ (`\`) はスラッシュ (`/`) に自動正規化される
- `--config` と `--input`/`--output` を同時指定した場合、コマンドライン引数が優先される

## セットアップ(利用者向け)

### 1. ツールのインストール

```bash
git clone <repo-url>
cd mcp-db-schema-analyze
npm install
npm run build
```

### 2. SQLファイルの前処理

MCPサーバーは **テーブル単位で1ファイルに正規化されたディレクトリ** を前提に動作する。
既存のSQLファイル群がどんな構成であっても、`prepare` コマンドで正規化できる。

```bash
# 例: プロジェクトのSQLファイルが /work/myapp/db/ 以下にバラバラに配置されている場合
node dist/cli.js prepare \
  --input /work/myapp/db/ \
  --output /work/myapp/schema/
```

これにより以下のようなディレクトリが生成される:

```
/work/myapp/schema/
  ddl/
    users.sql           -- CREATE TABLE + COMMENT ON + INDEX + ALTER TABLE をまとめたもの
    orders.sql
    order_items.sql
  dml/
    roles.sql           -- INSERT INTO (マスタデータ)
    order_statuses.sql
  sequences/
    users_id_seq.sql    -- CREATE SEQUENCE
  functions/
    get_user_count.sql  -- CREATE FUNCTION
```

入力ディレクトリに複数のパスがある場合はカンマ区切りで指定:

```bash
node dist/cli.js prepare \
  --input /work/myapp/db/tables/,/work/myapp/db/indexes/,/work/myapp/db/seeds/ \
  --output /work/myapp/schema/
```

### 3. MCPクライアントへの登録

前処理で生成されたディレクトリ (`ddl/`, `dml/`, `sequences/`, `functions/`) を `SQL_DIRS` 環境変数に指定する。

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "db-schema-analyze": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-db-schema-analyze/dist/index.js"],
      "env": {
        "SQL_DIRS": "/work/myapp/schema/ddl,/work/myapp/schema/dml,/work/myapp/schema/sequences,/work/myapp/schema/functions"
      }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "db-schema-analyze": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-db-schema-analyze/dist/index.js"],
      "env": {
        "SQL_DIRS": "/work/myapp/schema/ddl,/work/myapp/schema/dml,/work/myapp/schema/sequences,/work/myapp/schema/functions"
      }
    }
  }
}
```

**Claude Code** (`.mcp.json`):

```json
{
  "mcpServers": {
    "db-schema-analyze": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-db-schema-analyze/dist/index.js"],
      "env": {
        "SQL_DIRS": "/work/myapp/schema/ddl,/work/myapp/schema/dml,/work/myapp/schema/sequences,/work/myapp/schema/functions"
      }
    }
  }
}
```

### 環境変数

| 変数名 | 必須 | 説明 |
|---|---|---|
| `SQL_DIRS` | Yes | カンマ区切りでprepare済みSQLディレクトリを指定。`ddl/`, `dml/`, `sequences/`, `functions/` を含めること |

### 別プロジェクトへの切り替え

`SQL_DIRS` を変えるだけで別のスキーマセットに切り替えられる:

```bash
# プロジェクトA用
node dist/cli.js prepare --input /work/app-a/db/ --output /work/app-a/schema/

# プロジェクトB用
node dist/cli.js prepare --input /work/app-b/db/ --output /work/app-b/schema/
```

MCPクライアントの設定で `SQL_DIRS` をプロジェクトごとに切り替える。

## 開発

```bash
# 依存インストール
npm install

# テスト実行
npx vitest run

# テスト(watchモード)
npx vitest

# フォーマット
npx biome format --write .

# リント
npx biome check --fix .

# ビルド
npm run build
```

## ライセンス

MIT
