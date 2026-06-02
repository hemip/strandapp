package com.teraim.strand.utils;

import android.os.Environment;

public class Constants {
    //Paths

    private final static String path = Environment.getExternalStorageDirectory().getPath();
    //Root for the data objects storing data per provyta.
    public final static String STRAND_ROOT_DIR = path+"/strand/";
    public final static  String LOCAL_EXPORT_DIR = Environment.getExternalStorageDirectory() + "/strand/" + "exported/";
    public final static  String LOCAL_DATA_DIR = Environment.getExternalStorageDirectory() + "/strand/" + "data/";
    public final static  String LOCAL_PICS_DIR = Environment.getExternalStorageDirectory() + "/strand/" + "bilder/";

    //SFTP Settings
    public final static  String REMOTE_EXPORT_DIR ="strandexport/";
    public final static  String REMOTE_BACKUP_DIR ="stranddata/";
    public final static  String REMOTE_PICS_DIR ="strandpics/";
    public final static  String SFTP_PASSWORD ="341bnVax";
    public final static  String SFTP_HOST ="akka.srh.slu.se";
    public final static  String SFTP_USER ="nils";
    public final static  int SFTP_PORT =22;

    //other settings
    public static final String KEY_PY_PARCEL = "com.teraim.strand.py_object";
    public static final String KEY_RUTA_ID= "ruta_id";
    public static final String KEY_PROVYTA_ID = "provyta_id";
    public static final String KEY_LAG_ID = "lag_id";
    public static final String KEY_INVENTERARE = "inventerare";
    public static final String KEY_CURRENT_PY = "py_id";
    public static final String KEY_PIC_NAME = "pic_name";
    public static final String KEY_CURRENT_TABLE = "curr_table";
    public static final String KEY_STATE = "key_state";
    public static final String KEY_CHAR = "key_char";
    public static final String KEY_ZONE_DISPLAY_STATE = "zone_display_state";
    public static final String KEY_HABITAT_DISPLAY_STATE = "habitat_display_state";
    public static final String KEY_HABITAT_DISPLAY_STATE_DYN = "habitat_display_table_dyn";
    public static final String KEY_PREV_ROW = "prev_row";



    //Configuration
    //30 seconds between saves.
    public static final int SAVE_INTERVAL = 30;
    public static final int ARTER = 1;
    public static final int TRÄD = 2;
    public static final int BUSKAR = 3;
    public static final int GRAMINIDER = 4;
    public static final int LAVAR = 5;
    public static final int MOSSOR = 6;
    public static final int ORTER = 7;
    public static final int RIS = 8;
    public static final int ORMBUNKAR = 9;

    public final static int MY_PERMISSIONS_REQUEST_ACCESS_FINE =1;
    public final static int MY_PERMISSIONS_REQUEST_WRITE_EXTERNAL_STORAGE =2;
}
