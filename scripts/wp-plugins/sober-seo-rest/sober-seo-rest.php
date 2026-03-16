<?php
/**
 * Plugin Name: Sober SEO REST
 * Description: Exposes a REST endpoint to write Yoast SEO meta (title, description, focus keyword) per post.
 * Version: 1.1.0
 * Author: Sober Founders Dev
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'rest_api_init', function () {
    register_rest_route( 'sober/v1', '/seo', [
        'methods'             => 'POST',
        'callback'            => 'sober_seo_update',
        'permission_callback' => function () {
            return current_user_can( 'edit_posts' );
        },
        'args' => [
            'post_id' => [
                'required'          => true,
                'type'              => 'integer',
                'minimum'           => 1,
                'sanitize_callback' => 'absint',
                'validate_callback' => function ( $value ) {
                    return is_numeric( $value ) && (int) $value > 0;
                },
            ],
            'title' => [
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ],
            'description' => [
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ],
            'focus_keyword' => [
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ],
        ],
    ] );

    register_rest_route( 'sober/v1', '/seo/(?P<post_id>\d+)', [
        'methods'             => 'GET',
        'callback'            => 'sober_seo_read',
        'permission_callback' => function () {
            return current_user_can( 'edit_posts' );
        },
        'args' => [
            'post_id' => [
                'required'          => true,
                'type'              => 'integer',
                'minimum'           => 1,
                'sanitize_callback' => 'absint',
                'validate_callback' => function ( $value ) {
                    return is_numeric( $value ) && (int) $value > 0;
                },
            ],
        ],
    ] );
} );

function sober_seo_update( WP_REST_Request $request ) {
    $post_id       = absint( $request->get_param( 'post_id' ) );
    $title         = sanitize_text_field( $request->get_param( 'title' ) );
    $description   = sanitize_text_field( $request->get_param( 'description' ) );
    $focus_keyword = sanitize_text_field( $request->get_param( 'focus_keyword' ) );

    if ( ! get_post( $post_id ) ) {
        return new WP_Error( 'invalid_post', 'Post not found.', [ 'status' => 404 ] );
    }

    global $wpdb;
    $table = $wpdb->prefix . 'yoast_indexable';

    // Verify Yoast table exists
    $table_check = $wpdb->get_var(
        $wpdb->prepare( 'SHOW TABLES LIKE %s', $table )
    );
    if ( $table_check !== $table ) {
        return new WP_Error( 'dependency_missing', 'Required SEO plugin table not found.', [ 'status' => 500 ] );
    }

    $updates = [];
    $formats = [];

    if ( $title ) {
        $updates['title'] = $title;
        $formats[]        = '%s';
    }
    if ( $description ) {
        $updates['description'] = $description;
        $formats[]              = '%s';
    }
    if ( $focus_keyword ) {
        $updates['primary_focus_keyword'] = $focus_keyword;
        $formats[]                        = '%s';
    }

    if ( empty( $updates ) ) {
        return new WP_Error( 'no_data', 'Provide at least one of: title, description, focus_keyword.', [ 'status' => 400 ] );
    }

    $row_exists = $wpdb->get_var( $wpdb->prepare(
        "SELECT id FROM {$table} WHERE object_id = %d AND object_type = 'post' LIMIT 1",
        $post_id
    ) );

    if ( $row_exists ) {
        $result = $wpdb->update(
            $table,
            $updates,
            [ 'object_id' => $post_id, 'object_type' => 'post' ],
            $formats,
            [ '%d', '%s' ]
        );
    } else {
        $result = $wpdb->insert(
            $table,
            array_merge( $updates, [
                'object_id'   => $post_id,
                'object_type' => 'post',
            ] ),
            array_merge( $formats, [ '%d', '%s' ] )
        );
    }

    if ( $result === false ) {
        return new WP_Error( 'db_error', 'Database write failed.', [ 'status' => 500 ] );
    }

    // Also write to post meta so Yoast picks it up on next page load
    if ( $title )         { update_post_meta( $post_id, '_yoast_wpseo_title', $title ); }
    if ( $description )   { update_post_meta( $post_id, '_yoast_wpseo_metadesc', $description ); }
    if ( $focus_keyword ) { update_post_meta( $post_id, '_yoast_wpseo_focuskw', $focus_keyword ); }

    return [
        'success' => true,
        'post_id' => $post_id,
        'updated' => array_keys( $updates ),
    ];
}

function sober_seo_read( WP_REST_Request $request ) {
    $post_id = absint( $request['post_id'] );

    if ( ! get_post( $post_id ) ) {
        return new WP_Error( 'invalid_post', 'Post not found.', [ 'status' => 404 ] );
    }

    return [
        'post_id'       => $post_id,
        'title'         => get_post_meta( $post_id, '_yoast_wpseo_title', true ),
        'description'   => get_post_meta( $post_id, '_yoast_wpseo_metadesc', true ),
        'focus_keyword' => get_post_meta( $post_id, '_yoast_wpseo_focuskw', true ),
    ];
}
