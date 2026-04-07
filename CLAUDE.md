# 開発ルール

## TDD

- テストを先に書き、実装を後から埋める
- 新しい機能を追加する際は、まずテストケースを作成してユーザーに確認を取る
- テストケースには「何を・なぜテストしているか」をテスト名・変数名・コメントで明示する
- **RED first**: 実装前にまずスタブ(最小限のexport)だけ用意してテストを実行し、全テストがFAILすることを確認する。環境・import・設定の不備をこの段階で潰す

## コード品質

- コーディングのたびに以下を実行し、エラーがあれば解消する:
  - `npx biome format --write .` (フォーマット)
  - `npx biome check --fix .` (リント)
  - `npx vitest run` (テスト)

## アーキテクチャ

- `docs/architecture.md` に従う
- 4層構成: domain / application / infrastructure / interface
- 依存の方向: interface → application → domain ← infrastructure
- domain層は外部ライブラリに依存しない
