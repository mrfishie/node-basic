/**
 * Provides the order of operations, and the mapping of operator to class
 *
 * NOTE: This *should* be in the reverse order of operations
 */

module.exports = [
    {
        ' and ': require('./AndComparator'),
        ' or ': require('./OrComparator')
    },
    {
        'not ': require('./NotComparator'),
        '=': require('./EqualComparator'),
        '>': require('./GtComparator'),
        '>=': require('./GteComparator'),
        '<': require('./LtComparator'),
        '<=': require('./LteComparator')
    },
    {
        '+': require('./AdditionOperator'),
        '-': require('./SubtractionOperator'),

        ' band ': require('./AndOperator'),
        ' bor ': require('./OrOperator'),
        ' bxor ': require('./XorOperator'),
        ' xor ': require('./XorOperator'),
        'bnot ': require('./NotOperator')
    },
    {
        '/': require('./DivisionOperator'),
        '*': require('./MultiplicationOperator')
    },
    {
        '^': require('./PowerOperator')
    }
];