# node-basic documentation
## Adding a statement

Note: this guide will be relatively vague as statements can be used for anything in the language (i.e they do not represent any specific type of syntax, but rather simply something that is parsed).

If you want to make any syntax changes or additions, statements are the way to do that. All statements are contained in the `lib/parser/statements` folder. Every statement should have a `toString`, `toJSON`, and `execute` method, which should be executed by any statements that hold the statement.

If you want to add some kind of statement found in an expression, you will want to look at modifying the `parseSingularExpression` function in `lib/parser/statements/ExpressionStatement.js`. This function parses part of an expression that doesn't contain any operators (for example, a single number, string, variable, function call, or pointer).

Good luck implementing your statement!