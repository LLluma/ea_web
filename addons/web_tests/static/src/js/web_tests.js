openerp.web_tests = function (db) {
    db.web.client_actions.add(
        'buncha-forms', 'instance.web_tests.BunchaForms');
    db.web_tests = {};
    db.web_tests.BunchaForms = db.web.OldWidget.extend({
        init: function (parent) {
            this._super(parent);
            this.dataset = new db.web.DataSetSearch(this, 'test.listview.relations');
            this.form = new db.web.FormView(this, this.dataset, false, {
                action_buttons: false,
                pager: false
            });
            this.form.registry = db.web.form.readonly;
        },
        render: function () {
            return '<div class="oe-bunchaforms"></div>';
        },
        start: function () {
            $.when(
                this.dataset.read_slice(),
                this.form.appendTo(this.$element)).then(this.on_everything_loaded);
        },
        on_everything_loaded: function (slice) {
            var records = slice[0].records;
            if (!records.length) {
                this.form.on_record_loaded({});
                return;
            }
            this.form.on_record_loaded(records[0]);
            _(records.slice(1)).each(function (record, index) {
                this.dataset.index = index+1;
                this.form.reposition($('<div>').appendTo(this.$element));
                this.form.on_record_loaded(record);
            }, this);
        }
    });
};
