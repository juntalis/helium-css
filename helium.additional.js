/**
 * @fileOverview Extending the functionality of helium. Done in a separate file to avoid screwing up the whitespaces in
 * the current helium.js. Eventually, I'll merge any additional functionality into the main file.
 * @author Charles Grunwald (Juntalis) <ch@rles.grunwald.me>
 * @version 0.1
 */


(function (w) {

	/**
	 * Some of helium's methods need to be overriden for now. This will store references to the original method.
	 * @private
	 */
	var originals = {};

	/**
	 * Whether or not to allow helium to call {@link helium.checkstatus} or {@link helium.nav}.
	 * @private
	 */
	var allow_next = true;

	/**
	 * Utility function that sets {@link allow_next} to false, calls a function, switches
	 * the variable back to its original value, and returns the result of our function call.
	 * @private
	 * @returns The return of our function call.
	 * @example
	 * // No reason to call find without status, but there's no method with arguments that make calls to checkstatus.
	 * var selector = without_status(helium.find, '.classname');
	 */
	var without_next = function() {
		var old_next = allow_next;
		var args = Array.prototype.slice.call(arguments);
		var func = args.shift();
		allow_next = false;
		var result = func.apply(this, args);
		allow_next = old_next;
		return result;
	};
	
	var _trim = function(str) {
		return str.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
	};

	/**
	 * Extends the {@link helium} object. If a method/field name already exists, the original will be backed up to
	 * {@link originals} before it is assigned the new value.
	 * @inner
	 */
	(function _extend(methods){
		for(var n in methods) {
			if(typeof w.helium[n] !== 'undefined')
				originals[n] = w.helium[n];
			w.helium[n] = methods[n];
		}
	})({

		/**
		 * Proxy method to the original {@link helium.checkstatus} function. Depending on the value of
		 * {@link allow_next}, it will either call the original checkstatus method, or just return.
		 * @borrows helium.checkstatus
		 * @returns {Boolean|void} Either the result of the original checkstatus call (false|void) or false.
		 */
		checkstatus : function() {
			return allow_next ? originals.checkstatus() : false;
		},

		/**
		 * Proxy method to the original {@link helium.nav} function. Depending on the value of
		 * {@link allow_next}, it will either call the original nav method, or just return.
		 * @borrows helium.nav
		 * @returns {void}
		 */
		nav : function(l) {
			if(allow_next) originals.nav(l);
		},

		/**
		 * Expands upon the existing {@link helium.findstylesheets} method to find inline styles, in addition to resolving
		 * imports.
		 * @returns {void}
		 */
		findstylesheets : function() {
			without_next(originals.findstylesheets);
			
			
			// find style elements on the page
			var styles = Sizzle('style');
			if( typeof w.helium.data.stylesheets === 'undefined' )
				w.helium.data.stylesheets = [];

			if(styles.length > 0) {
				var inline_styles = '';
				
				for(var i in styles)
					inline_styles += _trim(styles[i].innerHTML);
				
				if(inline_styles.length > 0) {
					w.helium.data.stylesheets.push({
						url: window.location.pathname,
						selectors: [],
						data: inline_styles
					});
				}
			}
			w.helium.save();

			//go to next page
			if( w.helium.data.findinglist.length > 0){
				w.helium.nav( w.helium.data.findinglist );
			}else{
				//update status
				w.helium.data.status = 2;
				w.helium.checkstatus();
			}
		},
		
		external_urls : [],

		resolve_url: function(origin, destination) {
			//append full URI if absent
			console.log("before");
			console.log("origin: " + origin);
			console.log("destination: " + destination);
			if(destination.indexOf('http') !== 0 && destination.substr(0,2) !== '//') {
				// make sure that relative URLs work too
				if (destination.indexOf('/') != 0) {
					
					if(origin.indexOf('/') != 0) {
						// Strip protocol
						if(origin.indexOf('http') === 0) origin = origin.substring(origin.indexOf('/'));
						
						// Strip the first two //'s
						if(origin.substr(0,2) === '//')
							origin = (origin = origin.substr(2)).substr(origin.indexOf('/'));
					}
					origin = origin.substr(0, origin.lastIndexOf('/'));
					// Strip any leading ./'s
					while(destination.indexOf('./') == 0) destination = destination.substr(2);
					
					// Navigate origin to parent directory.
					while(destination.indexOf('../') === 0) {
						if(origin.length > 0) origin = origin.substr(0, origin.lastIndexOf('/'));
						destination = destination.substr(3);
						// Strip any leading ./'s
						while(destination.indexOf('./') == 0) destination = destination.substr(2);
					}
					origin += '/';
					destination = origin + destination;
				}
			}
			console.log("after");
			console.log("origin: " + origin);
			console.log("destination: " + destination);
			return destination;
		},

		stylesheet_exists: function(url) {
			for(var i in w.helium.data.stylesheets)
				if(w.helium.data.stylesheets[i].toLowerCase() == url.toLowerCase())
					return true;
			return false;
		},
		
		expand_imports: function(url, data, callback) {
			var rgx = /@import\s{1,}url\((['"])?([^'"\r\n]+)\1\)[\s\r\n]*;/ig;
			var match = rgx.exec(data);
			if(match != null) console.log(match[2]);
			while (match != null) {
				var iurl = _trim(match[2]);
				if(iurl.length == 0) continue;
				iurl = w.helium.resolve_url(url, iurl);
				if(w.helium.stylesheet_exists(iurl)) continue;
				// This wont be processed since getcss is already running at this point, but
				// we'll add it anyways just in case this import appears again in another
				// file.
				w.helium.data.stylesheets.push({url: iurl,selectors: []});
				w.helium.get(iurl, w.helium.data.stylesheets.length - 1, callback);
				data = data.replace(match[0], '');
				match = rgx.exec(data);
			}
			return data;
		},
		
		/**
		 * Wraps the existing {@link helium.get} method. If the stylesheet object has a property named "data", it will
		 * call the callback with that instead of using AJAX to grab the stylesheet.
		 * @returns {void}
		 */
		get:function(url, index, callback) {
			if(typeof w.helium.data.stylesheets[index].data !== 'undefined') {
				var data = w.helium.data.stylesheets[index].data;
				data = w.helium.expand_imports(url, data, callback);
				delete w.helium.data.stylesheets[index].data;
				console.log("expand_imports returned " + data);
				callback(index, data);
			} else {
				console.log("getting url " + url);
				 var onresult = function(idx, data) {
					data = w.helium.expand_imports(url, data, callback);
					callback(idx, data);
				};
				originals.get(url, index, onresult);
			}
		}
	});
})(window);
