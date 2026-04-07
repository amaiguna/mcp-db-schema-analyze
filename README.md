# mcp-db-schema-analyze

PostgreSQLのDDL/DMLファイルを読み取り、DB構造を理解した上で会話できるMCPサーバー。

## 概要

生のSQLファイル群(CREATE TABLE, INSERT等)を読み込み、テーブル構造・リレーション・マスタデータを把握した状態で、SQLの組み立てや設計相談をスムーズに行えるようにするツール。

読み取るSQLファイル群は環境変数で切り替え可能。プロジェクトや環境ごとに異なるスキーマセットを扱える。

## 主な機能

- **DDL解析**: テーブル定義、カラム、型、制約、インデックス等を構造化して把握
- **リレーション解析**: 外部キーからテーブル間の関連を抽出
- **マスタデータ参照**: DML(INSERT文)からマスタデータの内容を把握
- **MCP Tools**:
  - テーブル一覧の取得
  - テーブル詳細(カラム、制約、インデックス)の参照
  - リレーション情報の参照
  - マスタデータの参照

## ユースケース

- 「このテーブルのカラム一覧を教えて」
- 「usersテーブルとordersテーブルの関連は?」
- 「このスキーマでN+1が起きそうなクエリパターンは?」
- 「どんなマスタデータが入ってる?」
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
  ddl/                        -- DDL全般
    users.sql                 -- CREATE TABLE + COMMENT ON + 関連INDEX/SEQUENCE
    orders.sql
    order_items.sql
  dml/                        -- マスタデータ(INSERT文)
    master_roles.sql
    master_statuses.sql
```

- `ddl/` にはCREATE TABLE, COMMENT ON, CREATE INDEX, CREATE SEQUENCE, ALTER TABLE等を格納
- `dml/` にはマスタデータ投入用のINSERT文を格納
- ファイルはテーブル単位で1ファイルに正規化されていることを推奨
- ただし1ファイルに複数ステートメントが混在していても問題なく解析できる

### 前処理CLI (`prepare`)

既存のSQLファイル群が上記の構造になっていない場合、`prepare` コマンドで正規化できる:

```bash
npx mcp-db-schema-analyze prepare \
  --input ./raw-sql/ \
  --output ./sql/
```

`prepare` が行うこと:

1. `--input` 配下の `.sql` ファイルを再帰的に読み取る
2. pgsql-parserでステートメント単位に分解
3. DDL (CREATE / ALTER / COMMENT ON) と DML (INSERT) に自動分類
4. DDLはテーブル単位で1ファイルにまとめる(INDEX, SEQUENCE, COMMENT ON等を対応テーブルに紐付け)
5. DMLはテーブル単位で1ファイルにまとめる
6. `--output/ddl/`, `--output/dml/` に出力

元のファイル構成がどのようであっても、正規化された状態でMCPに食わせられるようになる。

## セットアップ(利用者向け)

```bash
git clone <repo-url>
cd mcp-db-schema-analyze
npm install
npm run build
```

### MCPクライアントへの登録

Claude Desktop、Cursor等の設定ファイルに以下を追加:

```json
{
  "mcpServers": {
    "db-schema-analyze": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-db-schema-analyze/dist/index.js"],
      "env": {
        "SQL_DIRS": "/path/to/sql/ddl,/path/to/sql/dml"
      }
    }
  }
}
```

- `SQL_DIRS`: カンマ区切りでSQLファイルが格納されたディレクトリを指定
- 各ディレクトリ配下の `.sql` ファイルを再帰的に読み取る

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
