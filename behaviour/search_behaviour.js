var getMetaphone = alchemy.use('double-metaphone'),
    all_prefixes = alchemy.shared('Routing.prefixes');

/**
 * The Search Behaviour class
 *
 * @constructor
 * @extends       Alchemy.Behaviour
 *
 * @author        Jelle De Loecker   <jelle@develry.be>
 * @since         0.1.0
 * @version       0.1.0
 */
var Search = Function.inherits('Alchemy.Behaviour', function SearchBehaviour(model, options) {
	Behaviour.call(this, model, options);
});

/**
 * Called when this behaviour is attached to a schema
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Search.setStatic(function attached(schema, options) {

	if (!schema.modelClass) {
		return;
	}

	schema.modelClass.setMethod(function search(config, options, callback) {

		var search_results,
		    datasource,
		    collection,
		    thisModel = this,
		    pointers = {},
		    Search = this.getModel('AlSearch'),
		    query,
		    ids;

		if (typeof config == 'string') {
			query = config;
			config = {};
		} else {
			query = config.query;
		}

		if (typeof options == 'function') {
			callback = options;
			options = {};
		}

		query = query.trim();

		datasource = thisModel.datasource;

		Function.series(function getCollection(next) {
			datasource.collection(Search.table, function gotCollection(err, _collection) {

				if (err) {
					return next(err);
				}

				collection = _collection;
				next();
			});
		}, function doAggregate(next) {

			var rx_keywords,
			    mp_matchers,
			    keywords,
			    pipeline,
			    matchers,
			    rx_piece,
			    pieces,
			    piece,
			    i;

			pieces = query.split(/[\s+,]/).filter(Boolean);
			keywords = [];
			rx_keywords = [];
			mp_matchers = [];
			matchers = [];

			matchers.push({
				name  : 'exact',
				field : 'value',
				value : query,
				mod   : 100
			});

			if (query.length > 2) {
				matchers.push({
					name  : 'starts_with',
					field : 'value',
					rx    : RegExp.interpret('^' + query, 'i'),
					start : true,
					value : query,
					mod   : 40
				});
			}

			if (query.length > 3) {
				matchers.push({
					name  : 'contains',
					field : 'value',
					rx    : RegExp.interpret(query, 'i'),
					value : query,
					mod   : 30
				});
			}

			// Do regular pieces & rx pieces
			for (i = 0; i < pieces.length; i++) {
				piece = pieces[i];

				if (piece.length > 2) {
					rx_piece = RegExp.interpret(piece, 'i');
					keywords.push(piece);
					rx_keywords.push(rx_piece);

					matchers.push({
						name  : 'starts_with_piece',
						field : 'value',
						rx    : RegExp.interpret('^' + piece, 'i'),
						start : true,
						value : piece,
						mod   : Math.min(15, piece.length * 8)
					});

					matchers.push({
						name  : 'identical_piece',
						field : 'value',
						value : piece,
						mod   : Math.min(40, piece.length * 8)
					});

					matchers.push({
						name  : 'rx_piece',
						field : 'value',
						rx    : rx_piece,
						value : piece,
						mod   : Math.min(20, piece.length * 8)
					});
				}
			}

			// Now do metaphone pieces
			for (i = 0; i < pieces.length; i++) {
				piece = pieces[i];

				// Only use larger words for metaphone search
				if (piece.length < 4) {
					continue;
				}

				piece = getMetaphone(pieces[i]).join(' ').trim();

				matchers.push({
					name  : 'identical_mp',
					field : 'metaphone',
					value : piece,
					meta  : true,
					mod   : 15
				});

				matchers.push({
					name  : 'starts_with_mp',
					field : 'metaphone',
					rx    : RegExp.interpret('^' + piece, 'i'),
					start : true,
					value : piece,
					meta  : true,
					mod   : 8
				});

				matchers.push({
					name  : 'contains_mp',
					field : 'metaphone',
					rx    : RegExp.interpret(piece, 'i'),
					value : piece,
					meta  : true,
					mod   : 2
				});
			}

			// Sort the matchers, the highest modder should be checked first
			matchers.sortByPath(-1, 'mod');

			let mp_branches = [],
			    branches = [],
			    $project,
			    matcher,
			    index,
			    temp,
			    $or = [];

			for (i = 0; i < matchers.length; i++) {
				matcher = matchers[i];

				// Add the strict equal match
				temp = {};
				temp[matcher.field] = matcher.value;
				$or.push(temp);

				let value = matcher.value;
				let field = '$' + matcher.field;

				if (!matcher.meta) {
					value = value.toLowerCase();
					field = {$toLower: field};
				}

				if (matcher.rx != null) {
					// Add the regex to the matchers
					temp = {};
					temp[matcher.field] = matcher.rx;
					$or.push(temp);

					// Add it to the switch cashe using indexOf
					if (matcher.start) {
						temp = {
							$eq : [
								{$indexOfCP: [field, value]},
								0
							]
						};
					} else {
						temp = {
							$gt : [
								{$indexOfCP: [field, value]},
								-1
							]
						};
					}
				} else {
					temp = {
						$eq: [field, value]
					};
				}

				if (matcher.meta) {
					mp_branches.push({
						case : temp,
						then : matcher.mod
					});
				} else {
					branches.push({
						case : temp,
						then : matcher.mod
					});
				}
			}

			$project = {
				field_name : 1,
				record_id  : 1,
				value      : 1,
				weight     : 1
			};

			if (branches.length) {
				$project.mod = {
					$switch : {
						branches : branches,
						default  : 0
					}
				};
			}

			if (mp_branches.length) {
				$project.mp_mod     = {
					$switch : {
						branches : mp_branches,
						default  : 0
					}
				};
			}

			let $match = {
				model : thisModel.name,
				$or   : $or
			};

			// Limit the search to certain fields if needed
			if (options.search_fields) {
				let fields = Array.cast(options.search_fields);
				$match.field_name = {$in: fields};
			}

			pipeline = [
				{
					$match : $match
				},
				{
					$project : $project
				},
				{
					$project : {
						field_name : 1,
						record_id  : 1,
						value      : 1,
						weight     : 1,
						mod : 1,
						mp_mod: 1,
						score : {
							$add : [
								{$multiply: ['$mod', '$weight']},
								{$multiply: ['$mp_mod', '$weight']}
							]
						}
					}
				},
				{
					$group : {
						_id   : "$record_id",
						score : {$sum : '$score'}
					}
				},
				{
					$sort : {
						'score' : -1
					}
				}
			];

			if (config.skip) {
				pipeline.push({$skip: config.skip});
			}

			if (config.limit) {
				pipeline.push({$limit: config.limit});
			}

			collection.aggregate(pipeline, function gotResults(err, cursor) {

				if (err) {
					return next(err);
				}

				cursor.toArray(function gotArray(err, results) {

					if (err) {
						return next(err);
					}

					search_results = results;
					ids = [];

					for (i = 0; i < results.length; i++) {
						ids.push(results[i]._id);
					}

					next();
				});
			});
		}, function done(err) {

			if (err) {
				return callback(err);
			}

			let final_options = JSON.clone(options);
			let want_document = final_options.document;

			if (want_document !== false) {
				want_document = true;
			}

			if (!final_options.conditions) {
				final_options.conditions = {};
			}

			// Always overwrite the _ids to look for
			final_options.conditions._id = ids;

			final_options.document = want_document;

			thisModel.find('all', final_options, function gotFinalResults(err, results) {

				if (err) {
					return callback(err);
				}

				let record,
				    temp,
				    i,
				    j;

				for (i = 0; i < results.length; i++) {
					record = results[i];

					for (j = 0; j < search_results.length; j++) {
						temp = search_results[j];

						if (String(temp._id) == String(record._id)) {
							record.$record.__score = temp.score;
							break;
						}
					}
				}

				results.sortByPath(-1, '$record.__score');

				callback(null, results);
			});
		});
	});
});

/**
 * Called after the model saves a record.
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Search.setMethod(function afterSave(record, options, created) {

	var that = this,
	    next = this.wait();

	// Find the complete saved item
	Model.get(that.model.name).find('first', {conditions: {_id: record._id}}, function gotFullRecord(err, result) {

		if (err) {
			return next(err);
		}

		if (!result) {
			return next();
		}

		result = result[that.model.name];

		let Search = Model.get('AlSearch');

		Function.series(function deleteOld(next) {
			Search.find('all', {conditions: {record_id: record._id}}, function gotOldRecords(err, records) {

				if (err) {
					return next(err);
				}

				records.forEach(function eachRecord(record) {
					record.remove();
				});

				next();
			});
		}, function createNewRecords(next) {

			for (let field_name in that.options.fields) {
				let field = that.model.getField(field_name);

				if (!field) {
					return next(new Error('Field "' + field_name + '" does not exist, can not add to search'));
				}

				let weight = that.options.fields[field_name];
				let value = result[field_name];

				if (value == '' || value == null) {
					continue;
				}

				let data = {
					model      : that.model.name,
					record_id  : record._id,
					field_name : field_name,
					weight     : weight
				};

				if (field.isTranslatable) {

					// Should be an object. If it's not, skip it
					if (!Object.isPlainObject(value)) {
						continue;
					}

					for (let prefix in value) {
						let prefix_value = value[prefix];

						if (prefix_value == '' || prefix_value == null) {
							continue;
						}

						saveValue(prefix_value, data, prefix);
					}
				} else {
					saveValue(value, data);
				}
			}

			next();
		}, next)

		function saveValue(value, data, language) {

			data = Object.assign({}, data);

			data.value = value;

			if (typeof value == 'string') {
				let pieces = value.split(/[\s+,]/).filter(Boolean);
				let metaphones = [];
				let piece;

				for (let i = 0; i < pieces.length; i++) {
					piece = pieces[i];

					if (piece.length < 4) {
						continue;
					}

					metaphones.push(getMetaphone(pieces[i]).join(' '));
				}

				metaphones = metaphones.join(' ').trim();

				if (metaphones) {
					data.metaphone = metaphones;
				}
			}

			if (language) {
				data.language = language;
			}

			Search.save(data);
		}
	});
});