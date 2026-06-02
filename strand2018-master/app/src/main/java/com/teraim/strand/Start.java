package com.teraim.strand;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.support.v4.app.ActivityCompat;
import android.support.v4.content.ContextCompat;
import android.util.Log;

import com.teraim.strand.utils.Constants;

import java.io.File;
import java.io.IOException;

public class Start extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_start);
    }
    @Override
    protected void onResume() {
        super.onResume();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, Constants.MY_PERMISSIONS_REQUEST_WRITE_EXTERNAL_STORAGE
            );
            super.onResume();
            return;
        }
        else if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, Constants.MY_PERMISSIONS_REQUEST_ACCESS_FINE
            );
            super.onResume();
            return;
        }
        else{ // All good with permisions, start app.
            //Check if I am running for the first time. If so, perform initial init.
            initIfFirstTime();
            Intent i = new Intent(this,ActivityMain.class);
            this.startActivity(i);
        }

    }
    private void initIfFirstTime() {
        //If testFile doesnt exist it will be created and found next time.
        String t = Constants.STRAND_ROOT_DIR +
                "ifiexistthenallisfine.txt";
        File f = new File(t);
        Log.d("Strand","Checking if this is first time use...");
        boolean exists = f.exists();

        if (!exists) {
            Log.d("Strand","Yes..executing  first time init");
            //create data folder. This will also create the ROOT folder for the Strand app.
            File folder = new File(Constants.STRAND_ROOT_DIR);
            folder.mkdirs();
            folder = new File(Constants.LOCAL_DATA_DIR);
            folder.mkdirs();
            folder = new File(Constants.LOCAL_EXPORT_DIR);
            folder.mkdirs();
            folder = new File(Constants.LOCAL_PICS_DIR);
            folder.mkdirs();


            //create token file to stop further calls to init.
            try {
                f.createNewFile();
            } catch (IOException e) {
                // TODO Auto-generated catch block
                e.printStackTrace();
            }
        }
        else
            Log.d("Strand","..Not first time");

    }

}
