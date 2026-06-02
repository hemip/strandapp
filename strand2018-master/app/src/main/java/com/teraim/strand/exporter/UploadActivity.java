package com.teraim.strand.exporter;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.SftpException;
import com.teraim.strand.R;
import com.teraim.strand.utils.Constants;
import com.teraim.strand.utils.SFTPClient;
import com.teraim.strand.utils.SFTPUploadFile;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

public class UploadActivity extends Activity {
    private TextView uploadProgress, uploadInfoText;
    private String user = "";
    private List<SFTPUploadFile> filesToUppload;
    private static int progress;
    private ProgressBar progressBar;
    private int progressStatus = 0;
    private Handler handler = new Handler();

    private Button upploadButton, backButton;
    private LinearLayout results;


    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_upload);
        results = findViewById(R.id.uploadResults);
        results.removeAllViews();
        progress = 0;
        progressBar = findViewById(R.id.uploadProgressbar);
        progressBar.setMax(100); //vad som helst, vi vet inte hur många filer vi ska skicka just nu.
        progressBar.setProgress(0);
        upploadButton = findViewById(R.id.uploadUpload);
        upploadButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                OnUploadClick();
            }
        });

        backButton = findViewById(R.id.uploadTillbaka);
        backButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });
        uploadProgress = findViewById(R.id.uploadProgress);
        uploadProgress.setText("");
        uploadInfoText = findViewById(R.id.uploadInfoText);
        uploadInfoText.setText("");



    }

    private void OnUploadClick() {
        upploadButton.setEnabled(false);
        uploadInfoText.setText("Laddar upp...");
        results.removeAllViews();

        Intent i = getIntent();

        //Hämta användarnamn för servern, tex nils99 dvs nils+lagnummer
        user = Constants.SFTP_USER;
        user +=i.getIntExtra("lagnummer",0);
        filesToUppload = new ArrayList<>();

        AddToList((new File(Constants.LOCAL_EXPORT_DIR)).listFiles(), Constants.REMOTE_EXPORT_DIR);
        AddToList((new File(Constants.LOCAL_DATA_DIR)).listFiles(), Constants.REMOTE_BACKUP_DIR);
        AddToList((new File(Constants.LOCAL_PICS_DIR)).listFiles(), Constants.REMOTE_PICS_DIR);


        progressStatus = 0;
        progressBar.setMax(filesToUppload.size());
        progressBar.setProgress(progressStatus);

        new Thread(new Runnable() {
            public void run() {
                int uploadedFiles = 0;
                SFTPClient client = new SFTPClient();
                try {
                    client.Open(user);
                    for (final SFTPUploadFile u : filesToUppload) {

                        int res = client.UpploadFile(u, false);
                        uploadedFiles += res;
                        progressStatus += 1;
                        if (res > 0) {
                            handler.post(new Runnable() {
                                public void run() {
                                    TextView t = new TextView(getApplicationContext());
                                    t.setText(u.fileName);
                                    results.addView(t);
                                }
                            });


                        }
                        handler.post(new Runnable() {
                            public void run() {
                                progressBar.setProgress(progressStatus);
                                uploadProgress.setText(progressStatus + "/" + progressBar.getMax());
                            }
                        });
                    }
                    if (uploadedFiles > 0) {
                        handler.post(new Runnable() {
                            public void run() {
                                upploadButton.setEnabled(true);
                                uploadInfoText.setText("Klar, uppladded filer:");
                            }
                        });
                    } else {
                        handler.post(new Runnable() {
                            public void run() {
                                upploadButton.setEnabled(true);
                                uploadInfoText.setText("Klar, inga filer att ladda upp.");
                            }
                        });
                    }

                } catch (JSchException | SftpException e) {
                    handler.post(new Runnable() {
                        public void run() {
                            upploadButton.setEnabled(true);
                            uploadInfoText.setText("Fel: " + e.getCause() + "." + e.getMessage());
                            if (true) { // Under utveckling
                                return;
                            }
                        }
                    });
                } finally {
                    client.Close();
                }
            }
        }).start();
    }

    private void AddToList(File[] dir, String remoteDir) {
        if (dir != null && dir.length > 0) {
            for (File f : dir) {
                filesToUppload.add(new SFTPUploadFile(f.getParent(), f.getName(), remoteDir,f.lastModified()));
            }
        }
    }


}
