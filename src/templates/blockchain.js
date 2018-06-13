
function si_prefix(num) {
    let prefixes = ['', 'k', 'M', 'G', 'T', 'P', 'E'];
    let prefix = 0;
    while (num >= 1000 && prefix + 1 < prefixes.length) {
        prefix++;
        num /= 1000.;
    }
    if (prefix == 0) return num + ' ';
    return num.toFixed(3) + ' ' + prefixes[prefix];
}

function findPools() {

    to_find = []
    for (let a_ of $('a.find-pool')) {
        let a = $(a_)
        var pieces = a.attr('id').split('-');
        to_find.push(pieces[1]);
    }
    if (to_find) {
        $.ajax({
            dataType: 'json',
            method: 'POST',
            url: '/poolapi/find',
            data: { 'block': to_find },
            success: function (data) {
                for (var blk in data) {
                    let a = $('a#find-' + blk)
                    if (data[blk]) {
                        let pool = data[blk]
                        a.attr("href", pool.blocks_url);
                        a.text(pool.pool);
                        a.removeClass("find-pool");
                    }
                    else {
                        a.text("Unknown");
                        a.attr("title", "This block was either mined on an unknown pool or is very new");
                    }
                }
            }
        });
    }
}

function update_data() {
    $.getJSON('/api/transactions?limit=' + numOfLastBlocks(), function (d) {
        if (d['status'] != 'success') return;
        $('#last-updated').text(new Date().toLocaleTimeString())

        var data = d['data']

        var block_rows = $('.blocks tr.block-row')

        let new_rows = false;
        let after = $('.blocks tr:first-child');
        let earliest = Number.MAX_SAFE_INTEGER;
        let block_sizes = [];
        for (let b of data['blocks']) {
            block_sizes.push(b['size']);
            let blkhash = b['hash'], height = b['height'];
            let existing = block_rows.filter('#block-height-' + height);
            if (existing.length > 0) {
                let row = existing.first();
                if (row.children('td.hash').text() == blkhash) {
                    // Already exists, just need to update the age:
                    row.children('td.age').text(b['age']);
                    continue;
                }
                // Otherwise we found a block with a different hash: remove it and any of its transactions:
                row.nextUntil('tr.block-row').addBack().remove();
            }

            let row = $('<tr class="block-row" id="block-height-'+b['height']+'"></tr>');
            row.append($('<td class="height"><a href="/block/'+b['height']+'">'+b['height']+'</a></td>'));

            let forged = false;
            if (b['timestamp'] < earliest) earliest = b['timestamp'];
            else forged = true;

            let td = $('<td class="age">'+b['age']+'</td>');

            if (forged)
                td.addClass('out-of-order');
            if (/^-/.test(b['age'])) {
                td.addClass('negative');
                forged = true;
            }
            if (forged)
                td.attr("title", "This block is probably forged: it was observed with either a negative age or was followed by a block with an earlier timestamp");
            row.append(td);

            row.append($('<td class="diff">' + b['diff'] + '</td>'));
            row.append($('<td class="pool"><a class="find-pool" id="find-' + b['hash'] + '"></a></td>'));
            row.append($('<td class="size">' + (b['size'] / 1024.).toFixed(2) + '</td>'));
            row.append($('<td class="hash"><a href="/block/' + b['hash'] + '">' + b['hash'] + '</a></td>'));
            row.append($('<td class="fees">N/A</td>'));
            let outputs = 0;
            for (let tx of b['txs']) {
                outputs += tx['grf_outputs'];
            }
            row.append($('<td class="outputs">' + (outputs * 1e-10).toFixed(3) + '</td>'));
            row.append($('<td class="inputs">0(0)/1</td>'));
            row.append($('<td class="mixin">N/A</td>'));
            row.append($('<td class="txsize">' + (b['txs'][0]['tx_size'] / 1024.).toFixed(2) + '</td>'));

            row.insertAfter(after);
            after = row;

            let first = true;
            for (let tx of b['txs']) {
                if (first) { first = false; continue; }
                let row = $('<tr></tr>');
                row.append($('<td class="height age diff pool size" colspan="5"></td>'));
                row.append($('<td class="hash"><a href="/tx/' + tx['tx_hash'] + '">' + tx['tx_hash'] + '</a></td>'));
                row.append($('<td class="fees">' + (tx['tx_fee'] * 1e-10).toFixed(3) + '</td>'));
                row.append($('<td class="outputs">?</td>'));
                row.append($('<td class="inputs" title="A page refresh is required to see these values">?(?)/?</td>'));
                row.append($('<td class="mixin">' + tx['mixin'] + '</td>'));
                row.append($('<td class="txsize">' + (tx['tx_size'] / 1024.).toFixed(2) + '</td>'));
                row.insertAfter(after);
                after = row;
            }

            new_rows = true;
        }

        if (new_rows) {
            block_rows = $('.blocks tr.block-row')
            if (block_rows.length > numOfLastBlocks())
                $(block_rows[numOfLastBlocks()]).nextAll().addBack().remove()

            block_sizes.sort(function(a, b) { return a - b; });
            let mid1 = block_sizes[numOfLastBlocks() >> 1]
            let median = (numOfLastBlocks() % 2 == 0
                ? 0.5 * (mid1 + block_sizes[(numOfLastBlocks() >> 1) - 1])
                : mid1);
            $('#blk-size-median').text((median / 1024.).toFixed(2));

        }
    });

    $.getJSON('/api/networkinfo', function (d) {
        if (d['status'] != 'success') return;
        $('#last-updated').text(new Date().toLocaleTimeString())
        let data = d['data'];
        $('#network-info-diff').text(data['difficulty']);
        $('#network-info-hashrate').text(si_prefix(data['hash_rate']) + 'H/s');
        $('#network-info-fee-kb').text(data['fee_per_kb'] * 1e-10);
        $('#network-info-block-limit').text((data['block_size_limit'] / 2048.).toFixed(2));
        $('#mempool-size').text(data['tx_pool_size']);
        $('#mempool-size-kb').text((data['tx_pool_size_kbytes'] / 1024.).toFixed(2));
        let nio = $('#network-info-old');
        if (nio.length > 0) nio.remove();
    });

    $.getJSON('/api/emission', function (d) {
        if (d['status'] != 'success') return;
        $('#last-updated').text(new Date().toLocaleTimeString())
        let data = d['data'];
        $('#emission-amount').text((data['coinbase'] * 1e-10).toFixed(3));
        $('#emission-fees').text((data['fee'] * 1e-10).toFixed(3));
        $('#emission-block').text(data['blk_no']);
    });


    $.getJSON('/api/mempool?limit=25', function (d) {
        if (d['status'] != 'success') return;
        $('#last-updated').text(new Date().toLocaleTimeString())
        let data = d['data'];
        if (data['txs_no'] > data['limit'])
            $('#see_all_mempool').show();
        else
            $('#see_all_mempool').hide();
        let next = $('table.mempool tr.tx-row').first();
        for (let tx of data['txs']) {
            if (next.children('.hash').text() == tx['tx_hash']) {
                next.children('.age').text(tx['age']);
                next = next.next();
                continue;
            }
            let row = $('<tr class="tx-row"></tr>');
            row.append($('<td class="age">' + tx['age'] + '</td>'));
            row.append($('<td class="hash"><a href="/tx/' + tx['tx_hash'] + '">' + tx['tx_hash'] + '</a></td>'));
            row.append($('<td class="fee">' + (tx['tx_fee'] * 1e-10).toFixed(3) + '</td>'));
            row.append($('<td class="inout" title="A page refresh is required to see these values">?(?)/?</td>'));
            row.append($('<td class="mixin">' + tx['mixin'] + '</td>'));
            row.append($('<td class="size">' + (tx['tx_size'] / 1024.).toFixed(2) + '</td>'));
            row.insertBefore(next);
        }
        next.nextAll().addBack().remove();
    });

    findPools();
}

var page_updater = null

function enable_updates(e) {
    if (e)
        e.preventDefault();
    $('#auto-update').removeClass('updates-disabled').addClass('updates-enabled');
    update_data();
    if (!page_updater)
        page_updater = setInterval(update_data, 30000);
}
function disable_updates(e) {
    e.preventDefault();
    $('#auto-update').removeClass('updates-enabled').addClass('updates-disabled');
    if (page_updater)
        clearInterval(page_updater);
    page_updater = null;
}


$(function() {

    findPools();

    if (window.location.pathname == '/') {
        enable_updates();
        let au = $('#auto-update');
        au.show();
        au.find('.updating a').click(disable_updates);
        au.find('.not-updating a').click(enable_updates);

    }
});

