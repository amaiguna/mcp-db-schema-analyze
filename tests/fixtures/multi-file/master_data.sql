-- マスタデータ投入 (DML)

INSERT INTO roles (id, name) VALUES (1, 'admin');
INSERT INTO roles (id, name) VALUES (2, 'member');
INSERT INTO roles (id, name) VALUES (3, 'guest');

INSERT INTO order_statuses (id, label) VALUES
    (1, '未処理'),
    (2, '処理中'),
    (3, '完了'),
    (4, 'キャンセル');
