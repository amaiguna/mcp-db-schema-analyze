# アーキテクチャ設計

## レイヤー構成

```
src/
  domain/           -- ドメインモデル・ドメインロジック (依存なし)
  application/      -- ユースケース (domainに依存)
  infrastructure/   -- 外部技術との接続 (pgsql-parser, ファイルI/O)
  interface/        -- 外部インターフェース (MCP, CLI)
```

依存の方向: `interface → application → domain ← infrastructure`

## ディレクトリ詳細

```
src/
  domain/
    model/
      schema.ts             -- Schema (集約ルート: tables + relations + masterData)
      types.ts              -- Table, Column, Constraint, Index, Relation, MasterData 等の型定義

  application/
    schema-registry.ts      -- 遅延ロード + キャッシュによるスキーマ参照 (MCPサーバーが使う)
    prepare-sql.ts          -- SQLファイル群 → カテゴリ別・名前単位に正規化して出力するユースケース

  infrastructure/
    parser/
      ddl-extractor.ts      -- AST → Table, Relation 等のドメインモデルへ変換
      dml-extractor.ts      -- AST → MasterData へ変換
    file/
      sql-file-reader.ts    -- ディレクトリからの .sql ファイル読み取り
      sql-file-scanner.ts   -- ディレクトリをスキャンしてファイル名→パスの対応表を構築
      sql-file-writer.ts    -- 正規化後の .sql ファイル書き出し (prepare用)

  interface/
    mcp/
      server.ts             -- MCPサーバー初期化・ツール登録 (9ツール)
    cli/
      prepare.ts            -- prepare コマンドのエントリポイント
      config.ts             -- JSON設定ファイルの読み込み・パス正規化

  index.ts                  -- MCPサーバー起動エントリポイント
  cli.ts                    -- CLI エントリポイント
```

## ドメインモデル

```
Schema (集約ルート)
├── tables: Table[]
│   ├── name: string
│   ├── columns: Column[]
│   │   ├── name, type, nullable, default, comment
│   │   └── isPrimaryKey
│   ├── constraints: Constraint[]
│   │   └── type (PK / FK / UNIQUE / CHECK), columns, references
│   ├── indexes: Index[]
│   │   └── name, columns, unique
│   └── comment: string | null
├── relations: Relation[]
│   ├── fromTable, fromColumns
│   ├── toTable, toColumns
│   └── source: "fk" | "inferred"    -- FK制約由来か、同名カラム推定か
└── masterData: MasterData[]
    ├── table: string
    ├── columns: string[]
    └── rows: Record<string, unknown>[]
```

## データフロー

### 前提: prepare → MCP の2ステップ運用

```
1. prepare (前処理)
   元のSQLファイル群 (混在・1ファイル等どんな構成でもOK)
     → パース → 4カテゴリに分類 (DDL/DML/SEQUENCE/FUNCTION)
     → カテゴリ内で名前単位に1ファイルに分割
     → output/ddl/users.sql, output/dml/roles.sql,
       output/sequences/users_id_seq.sql, output/functions/get_user_count.sql ...

2. MCP サーバー (prepare 済みディレクトリを参照)
   SQL_DIRS → 名前単位のファイルを遅延ロード
```

prepare により名前単位1ファイルに正規化されていることが、遅延ロードの前提条件。

### MCPサーバー起動時 (軽量)

```
SQL_DIRS 環境変数
  → sql-file-scanner がディレクトリをスキャン
  → ディレクトリ名で分類 (ddl/dml/sequences/functions)
  → ファイル名から名前→ファイルパスの対応表を構築
  → SchemaRegistry がこの対応表を保持
  (この時点ではSQLのパースは行わない)
```

### MCPツール呼び出し時 (遅延パース)

```
単テーブル操作 (getTable, getMasterDataForTable):
  SchemaRegistry
    → 対象テーブルのファイルだけ読み取り・パース
    → キャッシュに格納して返す
    (他テーブルには触れない)

シーケンス/関数の参照 (getSequence, getFunction):
  SchemaRegistry
    → 対象ファイルをそのまま読み取って返す (パース不要、SQL定義テキストで返す)

横断操作 (getRelationsForTable, findSharedColumns):
  SchemaRegistry
    → 未パースのテーブルを全パース (初回のみ)
    → 全テーブルから Schema を構築しキャッシュ
    (2回目以降はキャッシュから即座に返す)
```

### prepare コマンド

```
--input ディレクトリ (または --config で設定ファイル指定)
  → sql-file-reader がファイル群を再帰的に読み取り (空ファイルはスキップ)
  → sql-parser が各ファイルをAST化
  → prepare-sql がステートメントを4カテゴリに分類・名前単位に集約
  → sql-file-writer が --output/ddl/, --output/dml/,
    --output/sequences/, --output/functions/ に書き出し
```

## SchemaRegistry

MCPサーバーが直接利用する application 層のクラス。

```
SchemaRegistry
├── ddlFiles: Map<tableName, filePath>       -- 起動時にファイル名から構築 (パース不要)
├── dmlFiles: Map<tableName, filePath>
├── sequenceFiles: Map<seqName, filePath>
├── functionFiles: Map<funcName, filePath>
│
├── tableCache: Map<tableName, Table>        -- 遅延パース結果のキャッシュ
├── masterDataCache: Map<tableName, MasterData>
├── fullSchema: Schema | null                -- 横断操作時に一括構築
│
│  -- 単テーブル操作 (1ファイルだけパース) --
├── getTableNames(): string[]                -- ファイル一覧から即座に返す
├── getTable(name): Promise<Table | undefined>
├── getMasterDataForTable(name): Promise<MasterData | undefined>
├── getMasterDataTables(): string[]          -- ファイル一覧から即座に返す
│
│  -- シーケンス/関数 (ファイル読み取りのみ、パース不要) --
├── getSequenceNames(): string[]
├── getSequence(name): string | undefined
├── getFunctionNames(): string[]
├── getFunction(name): string | undefined
│
│  -- 横断操作 (初回は全パース、以降キャッシュ) --
├── getRelationsForTable(name): Promise<Relation[]>
└── findSharedColumns(options?): Promise<SharedColumn[]>
```

## 設計判断

### prepare を前段に必須とする理由

遅延ロードは「名前 = ファイル名」の対応が取れて初めて機能する。
元のSQLファイル群は1ファイルに全テーブルが入っている、DDLとDMLが混在している等
様々な構成がありうるため、ファイル名から名前を特定できない。
prepare でカテゴリ別・名前単位1ファイルに正規化することで、この前提を満たす。

### なぜ Schema を集約ルートに残すか

Schema は純粋なドメインモデル (データコンテナ + クエリロジック) として残す。
SchemaRegistry は Schema を内部で段階的に組み立てる application 層の仕組み。
横断操作時には全テーブルをパースして Schema を構築し、そのクエリメソッドに委譲する。
domain 層は遅延ロードの仕組みを知らない。

### FK確定リレーションと同名カラム推定の分離

レガシースキーマではFK制約が定義されていないケースが多い。
テーブル間で同名のカラム（例: `event_id`）が存在する場合、暗黙的なリレーション候補として検出する。
ただしFK由来の確定リレーションと同名カラム推定は `source` フィールドで明確に区別する。
利用者はこの区別を見て、推定の信頼度を判断できる。

### infrastructure の parser をなぜ分離するか

pgsql-parser のAST構造はドメインモデルと一致しない。
`ddl-extractor` / `dml-extractor` が変換層として機能し、ドメインがパーサに依存しないようにする。
パーサを差し替えたくなった場合(例: 別の方言対応)もここだけ変えればよい。

### interface 層の薄さ

MCP tools は薄いアダプタ。SchemaRegistry のメソッドを呼んで整形するだけ。
ビジネスロジックは domain と application に閉じる。

## テスト方針

```
tests/
  domain/
    model/              -- ドメインモデルの振る舞いテスト (Schema のクエリロジック)
  application/
    schema-registry.test.ts -- 遅延ロード・キャッシュの統合テスト
    prepare-sql.test.ts
  infrastructure/
    parser/             -- パーサの単体テスト (SQL文字列 → ドメインモデル)
  interface/
    mcp/                -- MCPツールの統合テスト (InMemoryTransport で実ツール呼び出し)
    cli/                -- CLI引数パース + 設定ファイル読み込みのテスト
```

- TDD: テストを先に書き、実装を後から埋める
- infrastructure/parser のテストが最も重要 — SQLの方言やエッジケースをここで担保
- domain は純粋なロジックなのでテストしやすい
- application/schema-registry は「何をパースしたか・していないか」のキャッシュ挙動が重要
- interface は薄いのでテスト量は少なめ
