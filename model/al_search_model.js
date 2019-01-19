/**
 * The Alchemy Search Model class
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
var Search = Function.inherits('Alchemy.Model.App', function AlSearch(conduit, options) {
	AlSearch.super.call(this, conduit, options);
});

/**
 * Constitute the class wide schema
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Search.constitute(function addFields() {

	// The model origin
	this.addField('model', 'String');

	// The original record id
	this.addField('record_id', 'ObjectId');

	// The field name
	this.addField('field_name', 'String');

	// The weight of this entry
	this.addField('weight', 'Number');

	// The field value
	this.addField('value', 'String');

	// The metaphone value
	this.addField('metaphone', 'String');

	// Optional language
	this.addField('language', 'String');

	// Add indexes
	this.addIndex('model');
	this.addIndex('record_id');
	this.addIndex('field_name');
});

/**
 * Do a simple search
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Search.setMethod(function simpleSearch(config, callback) {

	var that = this,
	    default_conditions,
	    rx_keywords,
	    key_name,
	    keywords,
	    results,
	    fields,
	    pieces,
	    tasks,
	    piece,
	    query,
	    i;

	results = {};
	default_conditions = config.conditions || {};
	query = config.query.trim();
	fields = Array.cast(config.fields);
	pieces = query.split(/[\s+,]/).filter(Boolean);
	rx_keywords = [];
	keywords = [];
	tasks = [];
	key_name = config.key || '_id';

	for (i = 0; i < pieces.length; i++) {
		piece = pieces[i];

		if (piece.length > 2) {
			keywords.push(piece);
			rx_keywords.push(RegExp.interpret(piece, 'i'));
		}
	}

	for (let i = 0; i < fields.length; i++) {
		let field_name = fields[i];

		tasks.push(function doExact(next) {

			var conditions = Object.assign({}, default_conditions);
			conditions[field_name] = query;

			// Look for the entire query
			findRecords(100, conditions, next);
		});

		tasks.push(function doNearlyExact(next) {

			var conditions = Object.assign({}, default_conditions);
			conditions[field_name] = RegExp.interpret(query, 'i');

			findRecords(70, conditions, next);
		});

		tasks.push(function startsWith(next) {

			var conditions = Object.assign({}, default_conditions);
			conditions[field_name] = RegExp.interpret('^' + query, 'i');

			findRecords(15, conditions, next);
		});

		// Don't do individual keywords if there is only 1 keyword
		if (keywords.length == 1) {
			continue;
		}

		for (let i = 0; i < keywords.length; i++) {
			let keyword = keywords[i];
			let rx_keyword = rx_keywords[i];

			tasks.push(function startsWith(next) {

				var conditions = Object.assign({}, default_conditions);
				conditions[field_name] = RegExp.interpret('^' + keyword, 'i');

				findRecords(15, conditions, next);
			});

			// Search for identical matches
			tasks.push(function doKeyword(next) {
				var conditions = Object.assign({}, default_conditions);
				conditions[field_name] = keyword;

				findRecords(40, conditions, next);
			});

			// Search for general matches
			tasks.push(function doGeneralKeyword(next) {
				var conditions = Object.assign({}, default_conditions);
				conditions[field_name] = rx_keyword;

				findRecords(20, conditions, next);
			});
		}
	}

	Function.parallel(4, tasks, function done(err) {

		if (err) {
			return callback(err);
		}

		let record,
		    key;

		results = Object.values(results);
		results.sortByPath(-1, '__score');

		callback(null, results);
	});

	// Find with the given conditions
	function findRecords(importance, conditions, options, next) {

		var def_options = {
			recursive : 0,
			document  : false,
			limit     : 50,
			available : false
		};

		if (typeof options == 'function') {
			next = options;
			options = {};
		}

		options = Object.assign({}, def_options, options);
		options.conditions = conditions;

		if (config.query_fields) {
			options.fields = config.query_fields;
		}

		that.find('all', options, function gotResult(err, records) {
			scoreResults(err, records, importance, next);
		});
	}

	// Score the found records
	function scoreResults(err, records, importance, next) {

		var entry,
		    i;

		if (err) {
			return next(err);
		}

		for (i = 0; i < records.length; i++) {
			entry = records[i][that.name];

			if (!results[entry[key_name]]) {
				results[entry[key_name]] = entry;
				entry.__hits = 0;
				entry.__score = 0;
			} else {
				entry = results[entry[key_name]];
			}

			entry.__hits++;
			entry.__score += importance;
		}

		next();
	}

	function getSimilarCharPercentage(str_a, str_b) {

		var total_length = str_a.length + str_b.length,
		    result;

		result = (_countSimilarChars(str_a, str_b) + _countSimilarChars(str_b, str_a));

		result = (result / total_length) * 100;

		return result;
	}

	function _countSimilarChars(str_a, str_b) {

		var index,
		    result = 0,
		    a,
		    b,
		    i;

		a = str_a.toLowerCase().split('');
		b = str_b.toLowerCase().split('');

		for (i = 0; i < a.length; i++) {
			index = b.indexOf(a[i]);

			if (index > -1) {
				result++;
				b.splice(index, 1);
			}
		}

		return result;
	}
});

/**
 * Re-save all records in the database
 * without updating the 'updated' field
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Model.setMethod(function touchAll(callback) {

	var i = 1;

	if (!callback) {
		callback = Function.thrower;
	}

	this.find('all', {limit: 200}, function gotRecords(err, result) {

		var tasks = [];

		if (!result.length) {
			return callback(null);
		}

		result.forEach(function eachRecord(record) {
			tasks.push(function doSave(next) {
				record.save(null, {set_updated: false}, next);
			});
		});

		Function.parallel(8, tasks, function done(err) {

			if (err) {
				return callback(err);
			}

			result.findNextBatch(gotRecords);
		});
	});
});
