openerp.web_kanban = function (openerp) {

var _t = openerp.web._t,
   _lt = openerp.web._lt;
var QWeb = openerp.web.qweb;
openerp.web.views.add('kanban', 'openerp.web_kanban.KanbanView');

openerp.web_kanban.KanbanView = openerp.web.View.extend({
    template: "KanbanView",
    display_name: _lt('Kanban'),
    default_nr_columns: 3,
    init: function (parent, dataset, view_id, options) {
        this._super(parent);
        this.set_default_options(options);
        this.dataset = dataset;
        this.view_id = view_id;
        this.fields_view = {};
        this.fields_keys = [];
        this.group_by = null;
        this.state = {
            groups : {},
            records : {}
        };
        this.groups = [];
        this.form_dialog = new openerp.web.FormDialog(this, {}, this.options.action_views_ids.form, dataset).start();
        this.form_dialog.on_form_dialog_saved.add_last(this.do_reload);
        this.aggregates = {};
        this.group_operators = ['avg', 'max', 'min', 'sum', 'count'];
        this.qweb = new QWeb2.Engine();
        this.qweb.debug = openerp.connection.debug;
        this.qweb.default_dict = _.clone(QWeb.default_dict);
        this.has_been_loaded = $.Deferred();
        this.search_domain = this.search_context = this.search_group_by = null;
        this.currently_dragging = {};
        this.limit = options.limit || 80;
    },
    start: function() {
        this._super();
        this.$element.find('button.oe_kanban_button_new').click(this.do_add_record);
        this.$groups = this.$element.find('.oe_kanban_groups tr');
        var context = new openerp.web.CompoundContext(this.dataset.get_context());
        return this.rpc('/web/view/load', {
                'model': this.dataset.model,
                'view_id': this.view_id,
                'view_type': 'kanban',
                context: context
            }, this.on_loaded);
    },
    on_loaded: function(data) {
        this.fields_view = data;
        this.fields_keys = _.keys(this.fields_view.fields);
        this.add_qweb_template();
        this.has_been_loaded.resolve();
    },
    add_qweb_template: function() {
        for (var i=0, ii=this.fields_view.arch.children.length; i < ii; i++) {
            var child = this.fields_view.arch.children[i];
            if (child.tag === "templates") {
                this.transform_qweb_template(child);
                this.qweb.add_template(openerp.web.json_node_to_xml(child));
                break;
            } else if (child.tag === 'field') {
                this.extract_aggregates(child);
            }
        }
    },
    extract_aggregates: function(node) {
        for (var j = 0, jj = this.group_operators.length; j < jj;  j++) {
            if (node.attrs[this.group_operators[j]]) {
                this.aggregates[node.attrs.name] = node.attrs[this.group_operators[j]];
                break;
            }
        }
    },
    transform_qweb_template: function(node) {
        var qweb_prefix = QWeb.prefix;
        switch (node.tag) {
            case 'field':
                node.tag = qweb_prefix;
                node.attrs[qweb_prefix + '-esc'] = 'record.' + node.attrs['name'] + '.value';
                this.extract_aggregates(node);
                break;
            case 'button':
            case 'a':
                var type = node.attrs.type || '';
                if (_.indexOf('action,object,edit,delete,color'.split(','), type) !== -1) {
                    _.each(node.attrs, function(v, k) {
                        if (_.indexOf('icon,type,name,args,string,context,states,kanban_states'.split(','), k) != -1) {
                            node.attrs['data-' + k] = v;
                            delete(node.attrs[k]);
                        }
                    });
                    if (node.attrs['data-states']) {
                        var states = _.map(node.attrs['data-states'].split(','), function(state) {
                            return "record.state.raw_value == '" + _.str.trim(state) + "'";
                        });
                        node.attrs[qweb_prefix + '-if'] = states.join(' or ');
                    }
                    if (node.attrs['data-kanban_states']) {
                        var states = _.map(node.attrs['data-kanban_states'].split(','), function(state) {
                            return "record.kanban_state.raw_value == '" + _.str.trim(state) + "'";
                        });
                        node.attrs[qweb_prefix + '-if'] = states.join(' or ');
                    }
                    if (node.attrs['data-string']) {
                        node.attrs.title = node.attrs['data-string'];
                    }
                    if (node.attrs['data-icon']) {
                        node.children = [{
                            tag: 'img',
                            attrs: {
                                src: openerp.connection.prefix + '/web/static/src/img/icons/' + node.attrs['data-icon'] + '.png',
                                width: '16',
                                height: '16'
                            }
                        }];
                    }
                    if (node.tag == 'a') {
                        node.attrs.href = '#';
                    } else {
                        node.attrs.type = 'button';
                    }
                    node.attrs['class'] = (node.attrs['class'] || '') + ' oe_kanban_action oe_kanban_action_' + node.tag;
                }
                break;
        }
        if (node.children) {
            for (var i = 0, ii = node.children.length; i < ii; i++) {
                this.transform_qweb_template(node.children[i]);
            }
        }
    },
    do_add_record: function() {
        this.dataset.index = null;
        this.do_switch_view('form');
    },
    do_search: function(domain, context, group_by) {
        var self = this;
        this.search_domain = domain;
        this.search_context = context;
        this.search_group_by = group_by;
        $.when(this.has_been_loaded).then(function() {
            self.group_by = group_by.length ? group_by[0] : self.fields_view.arch.attrs.default_group_by;
            self.datagroup = new openerp.web.DataGroup(self, self.dataset.model, domain, context, self.group_by ? [self.group_by] : []);
            self.datagroup.list(self.fields_keys, self.do_process_groups, self.do_process_dataset);
        });
    },
    do_process_groups: function(groups) {
        this.do_clear_groups();
        this.dataset.ids = [];
        var self = this,
            remaining = groups.length - 1,
            groups_array = [];
        _.each(groups, function (group, index) {
            var dataset = new openerp.web.DataSetSearch(self, self.dataset.model, group.context, group.domain);
            dataset.read_slice(self.fields_keys.concat(['__last_update']), { 'limit': self.limit }).then(function(records) {
                self.dataset.ids.push.apply(self.dataset.ids, dataset.ids);
                groups_array[index] = new openerp.web_kanban.KanbanGroup(self, records, group, dataset);
                if (!remaining--) {
                    self.dataset.index = self.dataset.size() ? 0 : null;
                    self.do_add_groups(groups_array);
                }
            });
        });
    },
    do_process_dataset: function(dataset) {
        var self = this;
        this.do_clear_groups();
        this.dataset.read_slice(this.fields_keys.concat(['__last_update']), { 'limit': self.limit }).then(function(records) {
            var kgroup = new openerp.web_kanban.KanbanGroup(self, records, null, self.dataset);
            self.do_add_groups([kgroup]);
        });
    },
    do_reload: function() {
        this.do_search(this.search_domain, this.search_context, this.search_group_by);
    },
    do_clear_groups: function() {
        _.each(this.groups, function(group) {
            group.stop();
        });
        this.groups = [];
        this.$element.find('.oe_kanban_groups_headers, .oe_kanban_groups_records').empty();
    },
    do_add_groups: function(groups) {
        var self = this;
        _.each(groups, function(group) {
            self.groups[group.undefined_title ? 'unshift' : 'push'](group);
        });
        _.each(this.groups, function(group) {
            group.appendTo(self.$element.find('.oe_kanban_groups_headers'));
        });
        this.on_groups_started();
    },
    on_groups_started: function() {
        var self = this;
        this.compute_groups_width();
        if (this.group_by) {
            this.$element.find('.oe_kanban_column').sortable({
                connectWith: '.oe_kanban_column',
                handle : '.oe_kanban_draghandle',
                start: function(event, ui) {
                    self.currently_dragging.index = ui.item.index();
                    self.currently_dragging.group = ui.item.parents('.oe_kanban_column:first').data('widget');
                },
                stop: function(event, ui) {
                    var record = ui.item.data('widget'),
                        old_index = self.currently_dragging.index,
                        new_index = ui.item.index(),
                        old_group = self.currently_dragging.group,
                        new_group = ui.item.parents('.oe_kanban_column:first').data('widget');
                    if (!(old_group.title === new_group.title && old_group.value === new_group.value && old_index == new_index)) {
                        self.on_record_moved(record, old_group, old_index, new_group, new_index);
                    }
                },
                scroll: false
            });
        } else {
            this.$element.find('.oe_kanban_draghandle').removeClass('oe_kanban_draghandle');
        }
    },
    on_record_moved : function(record, old_group, old_index, new_group, new_index) {
        var self = this;
        $.fn.tipsy.clear();
        $(old_group.$element).add(new_group.$element).find('.oe_kanban_aggregates, .oe_kanban_group_length').hide();
        if (old_group === new_group) {
            new_group.records.splice(old_index, 1);
            new_group.records.splice(new_index, 0, record);
            new_group.do_save_sequences();
        } else {
            old_group.records.splice(old_index, 1);
            new_group.records.splice(new_index, 0, record);
            record.group = new_group;
            var data = {};
            data[this.group_by] = new_group.value;
            this.dataset.write(record.id, data, {}, function() {
                record.do_reload();
                new_group.do_save_sequences();
            }).fail(function(error, evt) {
                self.do_reload(); // TODO: use draggable + sortable in order to cancel the dragging when the rcp fails
            });
        }
    },
    compute_groups_width: function() {
        var unfolded = 0;
        _.each(this.groups, function(group) {
            unfolded += group.state.folded ? 0 : 1;
            group.$element.css('width', '');
        });
        _.each(this.groups, function(group) {
            if (!group.state.folded) {
                group.$element.css('width', Math.round(100/unfolded) + '%');
            }
        });
    },

    do_show: function() {
        this.do_push_state({});
        return this._super();
    }
});

openerp.web_kanban.KanbanGroup = openerp.web.OldWidget.extend({
    template: 'KanbanView.group_header',
    init: function (parent, records, group, dataset) {
        var self = this;
        this._super(parent);
        this.$has_been_started = $.Deferred();
        this.view = parent;
        this.group = group;
        this.dataset = dataset;
        this.dataset_offset = 0;
        this.aggregates = {};
        this.value = this.title = null;
        if (this.group) {
            this.value = group.value;
            this.title = group.value;
            if (this.value instanceof Array) {
                this.title = this.value[1];
                this.value = this.value[0];
            }
            var field = this.view.fields_view.fields[this.view.group_by];
            if (field) {
                try {
                    this.title = openerp.web.format_value(group.value, field, false);
                } catch(e) {}
            }
            _.each(this.view.aggregates, function(value, key) {
                self.aggregates[value] = group.aggregates[key];
            });
        }

        if (this.title === false) {
            this.title = _t('Undefined');
            this.undefined_title = true;
        }
        var key = this.view.group_by + '-' + this.value;
        if (!this.view.state.groups[key]) {
            this.view.state.groups[key] = {
                folded: false
            }
        }
        this.state = this.view.state.groups[key];
        this.$records = null;

        this.records = [];
        this.$has_been_started.then(function() {
            self.do_add_records(records);
        });
    },
    start: function() {
        var self = this,
            def = this._super();
        this.$records = $(QWeb.render('KanbanView.group_records_container', { widget : this}));
        this.$records.appendTo(this.view.$element.find('.oe_kanban_groups_records'));
        this.$element.find(".oe_kanban_fold_icon").click(function() {
            self.do_toggle_fold();
            self.view.compute_groups_width();
            return false;
        });
        this.$records.find('.oe_kanban_show_more').click(this.do_show_more);
        if (this.state.folded) {
            this.do_toggle_fold();
        }
        this.$element.data('widget', this);
        this.$records.data('widget', this);
        this.$has_been_started.resolve();
        return def;
    },
    stop: function() {
        this._super();
        if (this.$records) {
            this.$records.remove();
        }
    },
    do_show_more: function(evt) {
        var self = this;
        this.dataset.read_slice(this.view.fields_keys.concat(['__last_update']), {
            'limit': self.view.limit,
            'offset': self.dataset_offset += self.view.limit
        }).then(this.do_add_records);
    },
    do_add_records: function(records) {
        var self = this;
        _.each(records, function(record) {
            var rec = new openerp.web_kanban.KanbanRecord(self, record);
            rec.insertBefore(self.$records.find('.oe_kanban_show_more'));
            self.records.push(rec);
        });
        this.$records.find('.oe_kanban_show_more').toggle(this.records.length < this.dataset.size())
            .find('.oe_kanban_remaining').text(this.dataset.size() - this.records.length);
    },
    remove_record: function(id, remove_from_dataset) {
        for (var i = 0, ii = this.records.length; i < ii; i++) {
            if (this.records[i]['id'] === id) {
                this.records.splice(i, 1);
            }
        }
    },
    do_toggle_fold: function(compute_width) {
        this.$element.add(this.$records).toggleClass('oe_kanban_group_folded');
        this.state.folded = this.$element.is('.oe_kanban_group_folded');
    },
    do_save_sequences: function() {
        var self = this;
        if (_.indexOf(this.view.fields_keys, 'sequence') > -1) {
            _.each(this.records, function(record, index) {
                self.view.dataset.write(record.id, { sequence : index });
            });
        }
    }
});

openerp.web_kanban.KanbanRecord = openerp.web.OldWidget.extend({
    template: 'KanbanView.record',
    init: function (parent, record) {
        this._super(parent);
        this.group = parent;
        this.view = parent.view;
        this.id = null;
        this.set_record(record);
        if (!this.view.state.records[this.id]) {
            this.view.state.records[this.id] = {
                folded: false
            };
        }
        this.state = this.view.state.records[this.id];
    },
    set_record: function(record) {
        this.id = record.id;
        if(!_(this.view.dataset.ids).contains(this.id)) {
            this.view.dataset.ids.push(this.id)
        }
        this.record = this.transform_record(record);
    },
    start: function() {
        this._super();
        this.$element.data('widget', this);
        this.bind_events();
    },
    transform_record: function(record) {
        var self = this,
            new_record = {};
        _.each(record, function(value, name) {
            var r = _.clone(self.view.fields_view.fields[name] || {});
            if ((r.type === 'date' || r.type === 'datetime') && value) {
                r.raw_value = openerp.web.auto_str_to_date(value);
            } else {
                r.raw_value = value;
            }
            r.value = openerp.web.format_value(value, r);
            new_record[name] = r;
        });
        return new_record;
    },
    render: function() {
        this.qweb_context = {
            record: this.record,
            widget: this
        };
        for (var p in this) {
            if (_.str.startsWith(p, 'kanban_')) {
                this.qweb_context[p] = _.bind(this[p], this);
            }
        }
        return this._super({
            'content': this.view.qweb.render('kanban-box', this.qweb_context)
        });
    },
    bind_events: function() {
        var self = this,
            $show_on_click = self.$element.find('.oe_kanban_box_show_onclick');
        $show_on_click.toggle(this.state.folded);
        this.$element.find('.oe_kanban_box_show_onclick_trigger').click(function() {
            $show_on_click.toggle();
            self.state.folded = !self.state.folded;
        });

        this.$element.find('[tooltip]').tipsy({
            delayIn: 500,
            delayOut: 0,
            fade: true,
            title: function() {
                var template = $(this).attr('tooltip');
                if (!self.view.qweb.has_template(template)) {
                    return false;
                }
                return self.view.qweb.render(template, self.qweb_context);
            },
            gravity: 's',
            html: true,
            opacity: 0.8,
            trigger: 'hover'
        });

        this.$element.find('.oe_kanban_action').click(function() {
            var $action = $(this),
                type = $action.data('type') || 'button',
                method = 'do_action_' + (type === 'action' ? 'object' : type);
            if (_.str.startsWith(type, 'switch_')) {
                self.view.do_switch_view(type.substr(7));
            } else if (typeof self[method] === 'function') {
                self[method]($action);
            } else {
                self.do_warn("Kanban: no action for type : " + type);
            }
            return false;
        });
    },
    do_action_delete: function($action) {
        var self = this;
        if (confirm(_t("Are you sure you want to delete this record ?"))) {
            return $.when(this.view.dataset.unlink([this.id])).then(function() {
                self.group.remove_record(self.id);
                self.stop();
            });
        }
    },
    do_action_edit: function($action) {
        var self = this;
        if ($action.attr('target') === 'dialog') {
            this.view.form_dialog.select_id(this.id).then(function() {
                self.view.form_dialog.open();
            });
        } else {
            if (self.view.dataset.select_id(this.id)) {
                this.view.do_switch_view('form');
            } else {
                this.do_warn("Kanban: could not find id#" + id);
            }
        }
    },
    do_action_color: function($action) {
        var self = this,
            colors = '#FFFFFF,#CCCCCC,#FFC7C7,#FFF1C7,#E3FFC7,#C7FFD5,#C7FFFF,#C7D5FF,#E3C7FF,#FFC7F1'.split(','),
            $cpicker = $(QWeb.render('KanbanColorPicker', { colors : colors, columns: 2 }));
        $action.after($cpicker);
        $cpicker.mouseenter(function() {
            clearTimeout($cpicker.data('timeoutId'));
        }).mouseleave(function(evt) {
            var timeoutId = setTimeout(function() { $cpicker.remove() }, 500);
            $cpicker.data('timeoutId', timeoutId);
        });
        $cpicker.find('a').click(function() {
            var data = {};
            data[$action.data('name')] = $(this).data('color');
            self.view.dataset.write(self.id, data, {}, function() {
                self.record[$action.data('name')] = $(this).data('color');
                self.do_reload();
            });
            $cpicker.remove();
            return false;
        });
    },
    do_action_object: function ($action) {
        var button_attrs = $action.data();
        this.view.do_execute_action(button_attrs, this.view.dataset, this.id, this.do_reload);
    },
    do_reload: function() {
        var self = this;
        this.view.dataset.read_ids([this.id], this.view.fields_keys.concat(['__last_update'])).then(function(records) {
            if (records.length) {
                self.set_record(records[0]);
                self.do_render();
            } else {
                self.stop();
            }
        });
    },
    do_render: function() {
        this.$element.html(this.render());
        this.bind_events();
    },
    kanban_color: function(variable) {
        var number_of_color_schemes = 10,
            index = 0;
        switch (typeof(variable)) {
            case 'string':
                for (var i=0, ii=variable.length; i<ii; i++) {
                    index += variable.charCodeAt(i);
                }
                break;
            case 'number':
                index = Math.round(variable);
                break;
            default:
                return '';
        }
        var color = (index % number_of_color_schemes);
        return 'oe_kanban_color_' + color;
    },
    kanban_gravatar: function(email, size) {
        size = size || 22;
        email = _.str.trim(email || '').toLowerCase();
        var default_ = _.str.isBlank(email) ? 'mm' : 'identicon';
        var email_md5 = $.md5(email);
        return 'http://www.gravatar.com/avatar/' + email_md5 + '.png?s=' + size + '&d=' + default_;
    },
    kanban_image: function(model, field, id) {
        id = id || '';
        var url = openerp.connection.prefix + '/web/binary/image?session_id=' + this.session.session_id + '&model=' + model + '&field=' + field + '&id=' + id;
        if (this.record.__last_update && this.record.__last_update.raw_value) {
            var time = openerp.web.str_to_datetime(this.record.__last_update.raw_value).getTime();
            url += '&t=' + time;
        }
        return url;
    },
    kanban_text_ellipsis: function(s, size) {
        size = size || 160;
        if (!s) {
            return '';
        } else if (s.length <= size) {
            return s;
        } else {
            return s.substr(0, size) + '...';
        }
    }
});
};

// vim:et fdc=0 fdl=0 foldnestmax=3 fdm=syntax:
