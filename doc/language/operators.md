# node-basic documentation
## Operator Reference

An operator is anything used in an expression in BASIC. Most operators have two 'operands', one on the left and one on the right. Each operator has a 'precedence', which is the order in which the operators are executed in. BASIC follows the normal order of BOMDAS.

**Reference Format**

The reference will show the names of each operator, as well as information and usage examples. Operands are shown around the name of the operator. Operand names are surrounded in `<` and `>` for clarity. If the name of the operand ends with a dollar sign, it must be a string. If it ends with a question mark, it can be a string or number. Otherwise, it must be a number. Each operator has a precedence level from 1 to 6. The higher the level, the higher up in the operator order the operator is executed in. Two operators with the same precedence level will be executed from left to right.

**(<n?\>)**

Executes the expression inside the bracket before everything else. Precedence level of 6.

**<n\> ^ <p\>**

Raises n to the power of p. Precedence level of 5.

**<n\> * <n\>**

Multiplies the two operands together. Precedence level of 4.

**<b\> / <d\>**

Divides b by d. Precedence level of 4.

**<n?\> + <n?\>**

If the operands are numbers, adds them, otherwise concatenates them. Precedence level of 3.

**<b\> - <s\>**

Subtracts s from b. Precedence level of 3.

**<n\> BAND <n\>**

Returns the binary AND of the two operands. Precedence level of 3.

**<n\> BOR <n\>**

Returns the binary OR of the two operands. Precedence level of 3.

**<n\> BXOR <n\>** or **<n\> XOR <n\>**

Returns the binary XOR of the two operands. Precedence level of 3.

**BNOT <n\>**

Returns the binary NOT of a number. Precedence level of 3.

**NOT <n\>**

If n is 0, return 1, otherwise returns 0. Precedence level of 2.

**<n\> = <n\>**

Returns 1 if both operands are equal, otherwise returns 0. Precedence level of 2.

**<l\> > <r\>**

Returns 1 if l is bigger than r, otherwise returns 0. Precedence level of 2.

**<l\> >= <r\>**

Returns 1 if l is bigger than or equal to r, otherwise returns 0. Precedence level of 2.

**<l\> < <r\>**

Returns 1 if l is less than r, otherwise returns 0. Precedence level of 2.

**<l\> <= <r\>**

Returns 1 if l is less than or equal to r, otherwise returns 0. Precedence level of 2.

**<n\> AND <n\>**

If either operand is 0, returns 0, otherwise returns 1. Precedence level of 1.

**<n\> OR <n\>**

If either operand is not 0, returns 1, otherwise returns 0. Precedence level of 1.