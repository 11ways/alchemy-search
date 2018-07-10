/**
 * Add the search results of another list to this one
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Alchemy.DocumentList}   list   The other list to add
 *
 * @return   {Alchemy.DocumentList}   The new document list
 */
Classes.Alchemy.DocumentList.setMethod(function addSearchResultList(list) {

	var theirs,
	    match,
	    ours,
	    i,
	    j;

	for (i = 0; i < list.length; i++) {
		theirs = list[i];
		match = null;

		for (j = 0; j < this.length; j++) {
			ours = this[j];

			if (Object.alike(theirs._id, ours._id)) {
				match = ours;
				break;
			}
		}

		if (!match) {
			this.push(theirs);
			this.available++;
		} else {
			match.$record.__score += theirs.$record.__score;
		}
	}

	this.sortByPath(-1, '$record.__score');
});

/**
 * Get the best search result out of a document list
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Alchemy.DocumentList}   list   Optional other list
 *
 * @return   {Alchemy.Document}
 */
Classes.Alchemy.DocumentList.setMethod(function getBestSearchResult(list) {

	var context;

	if (list) {
		context = this.clone();
		context.addSearchResultList(list);
	} else {
		context = this;
	}

	return context[0];
});

/**
 * Get the best matching result out of this and another list
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Alchemy.DocumentList}   list   Optional other list
 *
 * @return   {Alchemy.Document}
 */
Classes.Alchemy.DocumentList.setMethod(function getBestSearchResultFromBothLists(list) {

	var results = [],
	    theirs,
	    match,
	    clone,
	    ours,
	    i,
	    j;

	clone = this.clone();

	for (i = 0; i < list.length; i++) {
		theirs = list[i];
		match = null;

		for (j = 0; j < clone.length; j++) {
			ours = clone[j];

			// @TODO: this should work with Object.alike
			if (String(theirs._id) == String(ours._id)) {
				match = ours;
				break;
			}
		}

		// We're only interested if it's a result in both!
		if (match) {
			match.$record.__score += theirs.$record.__score;
			results.push(match);
		}
	}

	results.sortByPath(-1, '$record.__score');

	return results[0];
});