# node-basic documentation
## Adding a function or constant

In node-basic, functions and constants are actually the same thing. A constant can be defined as a set value or a function. Most functions are contained in the `lib/functions` folder, and all of the constants and some miscellaneous functions are in the `lib/executor`. For this tutorial, we will create a function that gets the screen aspect ratio in the `float:1` format, where `float` is returned.

Open the `graphics.js` file in `lib/functions`. This file contains many graphics functions, such as ScreenWidth and ScreenHeight. At the bottom of the file, add the following code:

	/**
	 * Gets the current aspect ratio, in float:1 format, where float is returned
	 * 
	 * @returns {number}
	 */
	exports.aspect = function() {
	};

Here we create the basic function. The function name should always be lowercase. Any arguments provided to the function will be passed as the function arguments, and the function should return the result. The function context (the value of `this` inside the function) will be the current execution context.

Since this functions needs to access the width and height of the canvas, we will have to use the `draw` IOInterface again. This has already been imported as the `ctx` variable in this file, so we are ready to write the function.

	var result = 0;
	ctx.read(function(response, cancel) {
		if (response.command !== 'screensize') return;
		cancel();
		result = response.data.width / response.data.height;
	});
	ctx.write({ command: 'screensize' });
	return result;

Whats going on here?? Well, we've seen one part of this before. The `write` function call is exactly the same as the one in the adding a command guide, except without the arguments parameter.

Some commands, in this case `screensize`, send a response back to node-basic through the IOInterface. These responses are still synchronous, though, so any handlers added through the `read` function will still be executed before returning. Here, we first make sure that the response is from the `screensize` command, and then cancel the handler. This prevents the handler being called for any future `screensize` commands. We then set the result variable to the ratio, and return it.

We need to add the `read` handler *before* we call `write` because the `write` call is synchronous.

There we go! Now, open up node-basic in a graphical environment, and try out your new function!