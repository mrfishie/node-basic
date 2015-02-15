# ![node-basic](http://i.imgur.com/xseiUzV.png)

node-basic is a BASIC parser and executor written in Javascript. It can be used in Node or compiled with Browserify for use in a browser.

node-basic uses the flavor of BASIC from the iBASIC iOS app, however is designed to be flexible and easily modifiable.

node-basic should be able to run any programs written for iBASIC. While it is currently incomplete, the majority of programs should run fine, considering they are provided with a graphical environment supporting all commands.

node-basic includes a flexible interface to allow for the parent application to receive all terminal IO and rendering commands. An 'offical' web-based IDE is currently in the works.

<table>
    <tbody><tr>
        <th colspan="4">Install with Node:<br><code>npm install basic-lang --save</code></th>
        <th colspan="4">Install with Bower:<br><code>bower install basic --save</code></th>
    </tr>
    <tr>
        <th colspan="8"><a href="doc/starting.md">Check out the Getting Started Guide</a></th>
    </tr>
    <tr>
        <th rowspan="12" colspan="2"><a href="doc">Read the Documentation:</a></th>
        <th colspan="6"><a href="doc/language">Language</a></th>
    </tr>
    <tr>
        <td colspan="2"><a href="doc/language/introduction.md">Introduction</a></td>
        <td colspan="2"><a href="doc/language/commands.md">Command reference</a></td>
        <td colspan="2"><a href="doc/language/functions.md">Function reference</a></td>
    </tr>
    <tr>
        <td colspan="2"><a href="doc/language/constants.md">Constant reference</a></td>
        <td colspan="2"><a href="doc/language/operators.md">Operator reference</a></td>
        <td colspan="2"><a href="doc/language/examples.md">Examples</a></td>
    </tr>
    <tr>
        <th colspan="6"><a href="doc/parser">Parser</a></th>
    </tr>
    <tr>
        <td colspan="3"><a href="doc/parser/api.md">API reference</a></td>
        <td colspan="3"><a href="doc/parser/examples.md">Examples</a></td>
    </tr>
    <tr>
        <th colspan="6"><a href="doc/executor">Executor</a></th>
    </tr>
    <tr>
        <td colspan="3"><a href="doc/executor/api.md">API reference</a></td>
        <td colspan="3"><a href="doc/executor/examples.md">Examples</a></td>
    </tr>
    <tr>
        <td colspan="6"><a href="doc/executor/interface.md">Creating a custom IO/drawing interface</a></td>
    </tr>
    <tr>
        <th colspan="6"><a href="doc/extending">Extending the language</a></th>
    </tr>
    <tr>
        <td colspan="3"><a href="doc/extending/commands.md">Adding a command</a></td>
        <td colspan="3"><a href="doc/extending/functions.md">Adding a function or constant</a></td>
    </tr>
    <tr>
        <td colspan="3"><a href="doc/extending/operators.md">Adding an operator</a></td>
        <td colspan="3"><a href="doc/extending/statements.md">Adding a statement</a></td>
    </tr>
    <tr>
        <th colspan="3"><a href="doc/api.md">API reference</a></th>
        <th colspan="3"><a href="doc/examples.md">Examples</a></th>
    </tr>
</tbody></table>
