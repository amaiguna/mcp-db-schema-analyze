import { parse } from "pgsql-parser";
function resolveValue(node) {
    if (node.A_Const) {
        const val = node.A_Const.val;
        if (val.Integer)
            return val.Integer.ival;
        if (val.Float)
            return Number.parseFloat(val.Float.str);
        if (val.String)
            return val.String.str;
        if (val.Null)
            return null;
    }
    // boolean: PG parses `true` as TypeCast { arg: A_Const "t", typeName: bool }
    if (node.TypeCast) {
        const typeName = (node.TypeCast.typeName?.names ?? [])
            .map((n) => n.String?.str)
            .filter(Boolean);
        if (typeName.includes("bool")) {
            const str = node.TypeCast.arg?.A_Const?.val?.String?.str;
            return str === "t";
        }
    }
    return null;
}
export class DmlExtractor {
    async extract(sql) {
        const ast = await parse(sql);
        return this.processStatements(ast.stmts);
    }
    async extractMultiple(sqls) {
        const allStmts = [];
        for (const sql of sqls) {
            const ast = await parse(sql);
            allStmts.push(...ast.stmts);
        }
        return this.processStatements(allStmts);
    }
    processStatements(stmts) {
        const tableMap = new Map();
        for (const stmtWrapper of stmts) {
            const insertStmt = stmtWrapper.stmt?.InsertStmt;
            if (!insertStmt)
                continue;
            const tableName = insertStmt.relation.relname;
            const columns = (insertStmt.cols ?? []).map((c) => c.ResTarget.name);
            const valuesLists = insertStmt.selectStmt?.SelectStmt?.valuesLists ?? [];
            const rows = valuesLists.map((vl) => {
                const items = vl.List?.items ?? [];
                const row = {};
                for (let i = 0; i < columns.length; i++) {
                    row[columns[i]] = items[i] ? resolveValue(items[i]) : null;
                }
                return row;
            });
            const existing = tableMap.get(tableName);
            if (existing) {
                existing.rows.push(...rows);
            }
            else {
                tableMap.set(tableName, { table: tableName, columns, rows });
            }
        }
        return [...tableMap.values()];
    }
}
//# sourceMappingURL=dml-extractor.js.map