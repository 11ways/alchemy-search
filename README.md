# Alchemy Search

The search plugin for the Alchemy MVC

## Installation

Just installing the npm package can be done like this:

    $ npm install alchemy-search

## Activate

You can activate the plugin by adding this to the main `bootstrap.js` file:

```javascript
alchemy.usePlugin('search', {});
```

## Use

This plugin gives you a new behaviour `search` to add to your models,
you can do this after constituting your model.

You have to supply an options object when adding the behaviour.
Here you need to add the fields you want to make searchable and the importance of those fields.

```javascript
MyModel.constitute(function addFields() {

    // Add your fields like you normally would
    this.addField('name', 'String');
    this.addField('title', 'String', {translatable: true});
    this.addField('description', 'String', {translatable: true});

    // And finally add the search behaviour
    this.addBehaviour('search', {
        fields: {
            title       : 50,
            name        : 30,
            description : 10
        }
    });
});
```

Now, after a record of (in this example) `MyModel` has been saved, the search behaviour will create the required data in the database.

A new method has been added to the `Model` class: `touchAll(callback)`. It basically re-saves all the records in a model (without setting the `updated` date) and triggering the before- and after-save events.

Finally, you can search through the model like so:

