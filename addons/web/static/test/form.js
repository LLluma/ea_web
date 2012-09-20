$(document).ready(function () {
    var openerp;
    module("form.widget", {
        setup: function () {
            openerp = window.openerp.init(true);
            window.openerp.web.core(openerp);
            window.openerp.web.chrome(openerp);
            // views loader stuff
            window.openerp.web.data(openerp);
            window.openerp.web.views(openerp);
            window.openerp.web.list(openerp);
            window.openerp.web.form(openerp);
        }
    });
    test("compute_domain", function () {
        var fields = {
            'a': {value: 3},
            'group_method': {value: 'line'},
            'select1': {value: 'day'},
            'rrule_type': {value: 'monthly'}
        };
        ok(openerp.web.form.compute_domain(
            [['a', '=', 3]], fields));
        ok(openerp.web.form.compute_domain(
            [['group_method','!=','count']], fields));
        ok(openerp.web.form.compute_domain(
            [['select1','=','day'], ['rrule_type','=','monthly']], fields));
    });
    test("compute_domain or", function () {
        var web = {
            'section_id': {value: null},
            'user_id': {value: null},
            'member_ids': {value: null}
        };

        var domain = ['|', ['section_id', '=', 42],
                      '|', ['user_id','=',3],
                           ['member_ids', 'in', [3]]];

        ok(openerp.web.form.compute_domain(domain, _.extend(
            {}, web, {'section_id': {value: 42}})));
        ok(openerp.web.form.compute_domain(domain, _.extend(
            {}, web, {'user_id': {value: 3}})));

        ok(openerp.web.form.compute_domain(domain, _.extend(
            {}, web, {'member_ids': {value: 3}})));
    });
    test("compute_domain not", function () {
        var fields = {
            'a': {value: 5},
            'group_method': {value: 'line'}
        };
        ok(openerp.web.form.compute_domain(
            ['!', ['a', '=', 3]], fields));
        ok(openerp.web.form.compute_domain(
            ['!', ['group_method','=','count']], fields));
    });
});
