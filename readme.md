# ![node-basic](http://i.imgur.com/xseiUzV.png)

node-basic is a BASIC parser and executor written in Javascript. It can be used in Node or compiled with Browserify for use in a browser.

node-basic uses the flavor of BASIC from the iBASIC iOS app, however is designed to be flexible and easily modifiable.

node-basic should be able to run any programs written for iBASIC. While it is currently incomplete, the majority of programs should run fine, considering they are provided with a graphical environment supporting all commands.

node-basic includes a flexible interface to allow for the parent application to receive all terminal IO and rendering commands. An 'offical' web-based IDE is currently in the works.

<table>
    <tr>
        <th colspan="4">Install with Node:  
<code>npm install basic-lang --save</code></th>
        <th colspan="4">Install with Bower:  
<code>bower install basic --save</code></th>
    </tr>
    <tr>
        <th colspan="8">[Check out the Getting Started Guide](doc/starting.md)</th>
    </tr>
    <tr>
        <th rowspan="11" colspan="2">[Read the Documentation:](doc)</th>
        <th colspan="6">[Language](doc/language)</th>
    </tr>
    <tr>
        <td colspan="2">[Introduction](doc/language/introduction.md)</td>
        <td colspan="2">[Command reference](doc/language/commands.md)</td>
        <td colspan="2">[Function reference](doc/language/functions.md)</td>
    </tr>
    <tr>
        <td colspan="2">[Constant reference](doc/language/constants.md)</td>
        <td colspan="2">[Operator reference](doc/language/operators.md)</td>
        <td colspan="2">[Examples](doc/language/examples.md)</td>
    </tr>
    <tr>
        <th colspan="6">[Parser](doc/parser)</th>
    </tr>
    <tr>
        <td colspan="3">[API reference](doc/parser/api.md)</td>
        <td colspan="3">[Examples](doc/parser/examples.md)</td>
    </tr>
    <tr>
        <th colspan="6">[Executor](doc/executor)</th>
    </tr>
    <tr>
        <td colspan="3">[API reference](doc/executor/api.md)</td>
        <td colspan="3">[Examples](doc/executor/examples.md)</td>
    </tr>
    <tr>
        <td colspan="6">[Creating a custom IO/drawing interface](doc/executor/interface.md)</td>
    </tr>
    <tr>
        <th colspan="6">[Extending the language](doc/extending)</th>
    </tr>
    <tr>
        <td colspan="3">[Adding a command](doc/extending/commands.md)</td>
        <td colspan="3">[Adding a function or constant](doc/extending/functions.md)</td>
    </tr>
    <tr>
        <td colspan="3">[Adding an operator](doc/extending/operators.md)</td>
        <td colspan="3">[Adding a statement](doc/extending/statements.md)</td>
    </tr>
    <tr>
        <th colspan="3">[API reference](doc/api.md)</th>
        <th colspan="3">[Examples](doc/examples.md)</th>
    </tr>
</table>
